import { useCallback, useState } from "react";
import { useSession } from "@/features/auth/hooks/useSession";
import * as api from "../data/profilesApi";
import type { Uuid } from "@shared/domain";

/**
 * HOOKS -- mutations on profiles.
 *
 * The list itself lives on the session, because every screen needs it. This
 * hook owns the writes, and refreshes the session afterwards so the switcher,
 * counts, and tokens all stay consistent from one source.
 */
export function useProfiles() {
  const { profiles, activeProfile, setActiveProfileId, refresh } = useSession();
  const [isBusy, setIsBusy] = useState(false);

  const run = useCallback(
    async <T>(action: () => Promise<T>): Promise<T> => {
      setIsBusy(true);
      try {
        const result = await action();
        await refresh();
        return result;
      } finally {
        setIsBusy(false);
      }
    },
    [refresh],
  );

  const create = useCallback(
    async (name: string, serverIds: Uuid[] = []) => {
      const profile = await run(() =>
        api.createProfile({ name, server_ids: serverIds }),
      );
      // Switch to what you just made -- that is almost always the intent.
      setActiveProfileId(profile.id);
      return profile;
    },
    [run, setActiveProfileId],
  );

  const rename = useCallback(
    (id: Uuid, name: string) => run(() => api.updateProfile(id, { name })),
    [run],
  );

  const makeDefault = useCallback(
    (id: Uuid) => run(() => api.updateProfile(id, { is_default: true })),
    [run],
  );

  const remove = useCallback(
    async (id: Uuid) => {
      await run(() => api.deleteProfile(id));
      // Land somewhere valid rather than on a profile that no longer exists.
      const fallback = profiles.find((p) => p.is_default && p.id !== id);
      if (fallback) setActiveProfileId(fallback.id);
    },
    [run, profiles, setActiveProfileId],
  );

  const setServers = useCallback(
    (id: Uuid, serverIds: Uuid[]) => run(() => api.setProfileServers(id, serverIds)),
    [run],
  );

  return {
    profiles,
    activeProfile,
    setActiveProfileId,
    isBusy,
    create,
    rename,
    makeDefault,
    remove,
    setServers,
    fetchServers: api.fetchProfileServers,
  };
}
