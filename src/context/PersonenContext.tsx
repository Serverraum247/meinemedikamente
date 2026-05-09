/**
 * PersonenContext.tsx – Verwaltet die aktive Person (Patient)
 *
 * - Laedt alle Personen aus DB
 * - Merkt sich aktive Person (async storage)
 * - Stellt Umschalt-Funktion bereit
 * - Premium-Gate: Free=1, Premium=unbegrenzt
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  getAllPersonen,
  getStandardPerson,
  createPerson,
  updatePerson,
  deletePerson,
  getMaxPersonen,
  PersonRow,
} from '../database/PersonenController';
import { isPremium } from '../services/PremiumService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/Logger';

// ---------- Context Typ ----------

interface PersonenContextType {
  personen: PersonRow[];
  aktivePerson: PersonRow | null;
  premium: boolean;
  maxPersonen: number;
  loading: boolean;

  // Aktionen
  setAktivePerson: (person: PersonRow) => void;
  addPerson: (data: { name: string; avatar_emoji?: string; avatar_uri?: string }) => Promise<{ success: boolean; error?: string }>;
  editPerson: (id: string, updates: Partial<Pick<PersonRow, 'name' | 'avatar_emoji' | 'avatar_uri'>>) => Promise<void>;
  removePerson: (id: string) => Promise<{ success: boolean; error?: string }>;
  refresh: () => Promise<void>;
}

const PersonenContext = createContext<PersonenContextType | null>(null);

// ---------- Provider ----------

export const PersonenProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [personen, setPersonen] = useState<PersonRow[]>([]);
  const [aktivePerson, setAktivePersonState] = useState<PersonRow | null>(null);
  const [premium, setPremium] = useState(false);
  const [maxPersonen, setMaxPersonen] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [allPersonen, isPrem, max] = await Promise.all([
        getAllPersonen(),
        isPremium(),
        getMaxPersonen(),
      ]);
      setPersonen(allPersonen);
      setPremium(isPrem);
      setMaxPersonen(max);

      // Aktive Person laden (aus AsyncStorage oder Default)
      let savedId: string | null = null;
      try {
        savedId = await AsyncStorage.getItem('aktivePersonId');
      } catch { /* fallback */ }

      const found = savedId
        ? allPersonen.find(p => p.id === savedId) || await getStandardPerson()
        : await getStandardPerson();

      setAktivePersonState(found);
    } catch (error) {
      logger.error('Fehler beim Laden der Personen:', error);
      // Fallback: Standard-Person
      const standard = await getStandardPerson();
      setAktivePersonState(standard);
      setPersonen([standard]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const setAktivePerson = useCallback(async (person: PersonRow) => {
    setAktivePersonState(person);
    try {
      await AsyncStorage.setItem('aktivePersonId', person.id);
    } catch { /* non-critical */ }
  }, []);

  const addPerson = useCallback(async (data: { name: string; avatar_emoji?: string; avatar_uri?: string }) => {
    const result = await createPerson(data);
    if (result.success) {
      await loadData();
    }
    return { success: result.success, error: result.error };
  }, [loadData]);

  const editPerson = useCallback(async (id: string, updates: Partial<Pick<PersonRow, 'name' | 'avatar_emoji' | 'avatar_uri'>>) => {
    await updatePerson(id, updates);
    await loadData();
    // Falls die aktive Person bearbeitet wurde, State aktualisieren
    if (aktivePerson && aktivePerson.id === id) {
      const updated = await getAllPersonen();
      const found = updated.find(p => p.id === id);
      if (found) setAktivePersonState(found);
    }
  }, [aktivePerson, loadData]);

  const removePerson = useCallback(async (id: string) => {
    const result = await deletePerson(id);
    if (result.success) {
      // Falls die geloeschte Person aktiv war, auf Standard umschalten
      if (aktivePerson && aktivePerson.id === id) {
        const standard = await getStandardPerson();
        await setAktivePerson(standard);
      }
      await loadData();
    }
    return result;
  }, [aktivePerson, loadData, setAktivePerson]);

  const refresh = useCallback(async () => {
    await loadData();
  }, [loadData]);

  return (
    <PersonenContext.Provider
      value={{
        personen,
        aktivePerson,
        premium,
        maxPersonen,
        loading,
        setAktivePerson,
        addPerson,
        editPerson,
        removePerson,
        refresh,
      }}
    >
      {children}
    </PersonenContext.Provider>
  );
};

// ---------- Hook ----------

export function usePersonen(): PersonenContextType {
  const ctx = useContext(PersonenContext);
  if (!ctx) throw new Error('usePersonen muss innerhalb von PersonenProvider verwendet werden');
  return ctx;
}
