import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";

export interface Nucleo {
  id: string;
  nome: string;
}

interface NucleoContextValue {
  nucleos: Nucleo[];
  nucleoId: string | null;
  setNucleoId: (id: string) => void;
  podeAlternar: boolean;
}

const NucleoContext = createContext<NucleoContextValue | undefined>(undefined);

export function NucleoProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { data: nucleos = [] } = useQuery({ queryKey: ["nucleos"], queryFn: () => api.get<Nucleo[]>("/nucleos"), enabled: !!user });
  const [nucleoId, setNucleoId] = useState<string | null>(null);

  useEffect(() => {
    if (nucleoId || nucleos.length === 0) return;
    if (user?.nucleoId) {
      setNucleoId(user.nucleoId);
      return;
    }
    const pessoal = nucleos.find((n) => n.nome === "Pessoal");
    setNucleoId(pessoal?.id ?? nucleos[0].id);
  }, [nucleos, user, nucleoId]);

  return (
    <NucleoContext.Provider value={{ nucleos, nucleoId, setNucleoId, podeAlternar: user?.role === "DIRECAO" }}>
      {children}
    </NucleoContext.Provider>
  );
}

export function useNucleo(): NucleoContextValue {
  const ctx = useContext(NucleoContext);
  if (!ctx) throw new Error("useNucleo deve ser usado dentro de NucleoProvider");
  return ctx;
}
