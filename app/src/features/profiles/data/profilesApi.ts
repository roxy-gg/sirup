import { api } from "@/lib/api";
import type {
  CreateProfileBody,
  ProfileListResponse,
  ProfileResponse,
  SetProfileServersBody,
  UpdateProfileBody,
} from "@shared/api";
import type { Profile, Uuid } from "@shared/domain";

/**
 * DATA -- CRUD over profiles and their attachments.
 */

export async function fetchProfiles(): Promise<Profile[]> {
  const { profiles } = await api.get<ProfileListResponse>("/profiles");
  return profiles;
}

export async function createProfile(body: CreateProfileBody): Promise<Profile> {
  const { profile } = await api.post<ProfileResponse>("/profiles", body);
  return profile;
}

export async function updateProfile(
  id: Uuid,
  body: UpdateProfileBody,
): Promise<Profile> {
  const { profile } = await api.patch<ProfileResponse>(`/profiles/${id}`, body);
  return profile;
}

export function deleteProfile(id: Uuid): Promise<void> {
  return api.delete(`/profiles/${id}`);
}

/** Which connections a profile exposes. */
export async function fetchProfileServers(id: Uuid): Promise<Uuid[]> {
  const { server_ids } = await api.get<{ server_ids: Uuid[] }>(
    `/profiles/${id}/servers`,
  );
  return server_ids;
}

/** Replaces the whole attachment set. */
export async function setProfileServers(
  id: Uuid,
  serverIds: Uuid[],
): Promise<Profile> {
  const { profile } = await api.put<ProfileResponse>(`/profiles/${id}/servers`, {
    server_ids: serverIds,
  } satisfies SetProfileServersBody);
  return profile;
}

/**
 * Adds one connection to a profile, leaving the rest alone.
 *
 * Reads the current set and writes it back with the addition, rather than
 * needing a dedicated endpoint -- the attachment sets are small enough that a
 * read-modify-write is cheaper than another route to maintain.
 */
export async function attachServerToProfile(
  profileId: Uuid,
  serverId: Uuid,
): Promise<Profile> {
  const current = await fetchProfileServers(profileId);
  if (current.includes(serverId)) {
    const { profile } = await api.get<ProfileResponse>(`/profiles/${profileId}`);
    return profile;
  }
  return setProfileServers(profileId, [...current, serverId]);
}
