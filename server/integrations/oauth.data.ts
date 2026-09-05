import {
  McpOAuthCredentialModel,
  McpOAuthRequestModel,
} from "../database/models/index.js";
import type { Uuid } from "../../shared/domain.js";

export function insertRequest(values: Partial<McpOAuthRequestModel>) {
  return McpOAuthRequestModel.query().insert(values);
}

export function deleteExpiredRequests() {
  return McpOAuthRequestModel.query()
    .delete()
    .where("expires_at", "<=", new Date());
}

export function findActiveRequestByStateHash(stateHash: string) {
  return McpOAuthRequestModel.query()
    .findOne({ state_hash: stateHash })
    .whereNull("consumed_at")
    .where("expires_at", ">", new Date());
}

export function patchRequest(
  requestId: Uuid,
  values: Partial<McpOAuthRequestModel>,
) {
  return McpOAuthRequestModel.query().patchAndFetchById(requestId, values);
}

export async function consumeRequest(requestId: Uuid): Promise<boolean> {
  const count = await McpOAuthRequestModel.query()
    .patch({ consumed_at: new Date() })
    .where("id", requestId)
    .whereNull("consumed_at")
    .where("expires_at", ">", new Date());
  return count === 1;
}

export function deleteRequest(requestId: Uuid) {
  return McpOAuthRequestModel.query().deleteById(requestId);
}

export function findCredential(serverId: Uuid) {
  return McpOAuthCredentialModel.query().findById(serverId);
}

export function patchCredential(
  serverId: Uuid,
  values: Partial<McpOAuthCredentialModel>,
) {
  return McpOAuthCredentialModel.query().patchAndFetchById(serverId, values);
}

export function patchCredentialIfCurrent(
  serverId: Uuid,
  encryptedTokens: string,
  values: Partial<McpOAuthCredentialModel>,
) {
  return McpOAuthCredentialModel.query()
    .patch({ ...values, updated_at: new Date() })
    .where({ server_id: serverId, encrypted_tokens: encryptedTokens });
}
