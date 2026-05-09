/**
 * MedikamentContext.tsx – Globaler State für Medikamente
 *
 * Bietet alle CRUD-Operationen + Bestands-Logik als React Context an.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { database, MedikamentRow } from '../database/Database';
import {
  createMedikament,
  getAllMedikamente,
  einnahmeVerbuchen,
  updateBestand,
  updateMedikament,
  deleteMedikament,
  getMedikamenteUnterSchwelle,
} from '../database/MedikamentController';
import { logger } from '../utils/Logger';

interface MedikamentContextType {
  medikamente: MedikamentRow[];
  medikamenteUnterSchwelle: MedikamentRow[];
  loading: boolean;
  refresh: () => Promise<void>;
  addMedikament: (med: Omit<MedikamentRow, 'created_at' | 'updated_at'>) => Promise<string>;
  bestätigeEinnahme: (id: string, dosisOverride?: number) => Promise<number>;
  aktualisiereBestand: (id: string, bestand: number) => Promise<void>;
  bearbeiteMedikament: (id: string, updates: Partial<MedikamentRow>) => Promise<void>;
  entferneMedikament: (id: string) => Promise<void>;
}

const MedikamentContext = createContext<MedikamentContextType | undefined>(undefined);

export function MedikamentProvider({ children }: { children: React.ReactNode }) {
  const [medikamente, setMedikamente] = useState<MedikamentRow[]>([]);
  const [medikamenteUnterSchwelle, setMedikamenteUnterSchwelle] = useState<MedikamentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const all = await getAllMedikamente();
      setMedikamente(all);
      const unterSchwelle = await getMedikamenteUnterSchwelle();
      setMedikamenteUnterSchwelle(unterSchwelle);
    } catch (error) {
      logger.error('[Context] Fehler beim Laden:', error);
    }
  }, []);

  // Initial laden
  useEffect(() => {
    (async () => {
      try {
        await database.init();
        await refresh();
      } catch (error) {
        logger.error('[Context] Init-Fehler:', error);
      } finally {
        setLoading(false);
      }
    })();
  }, [refresh]);

  const addMedikament = async (med: Omit<MedikamentRow, 'created_at' | 'updated_at'>) => {
    const id = await createMedikament(med);
    await refresh();
    return id;
  };

  const bestätigeEinnahme = async (id: string, dosisOverride?: number) => {
    const neuerBestand = await einnahmeVerbuchen(id, dosisOverride);
    await refresh();
    return neuerBestand;
  };

  const aktualisiereBestand = async (id: string, bestand: number) => {
    await updateBestand(id, bestand);
    await refresh();
  };

  const bearbeiteMedikament = async (id: string, updates: Partial<MedikamentRow>) => {
    await updateMedikament(id, updates);
    await refresh();
  };

  const entferneMedikament = async (id: string) => {
    await deleteMedikament(id);
    await refresh();
  };

  return (
    <MedikamentContext.Provider
      value={{
        medikamente,
        medikamenteUnterSchwelle,
        loading,
        refresh,
        addMedikament,
        bestätigeEinnahme,
        aktualisiereBestand,
        bearbeiteMedikament,
        entferneMedikament,
      }}
    >
      {children}
    </MedikamentContext.Provider>
  );
}

export function useMedikamente() {
  const context = useContext(MedikamentContext);
  if (!context) {
    throw new Error('useMedikamente muss innerhalb von MedikamentProvider verwendet werden');
  }
  return context;
}
