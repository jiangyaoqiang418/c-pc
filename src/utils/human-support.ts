const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

export function isHumanHandoffCard(value: unknown): value is Api.Ai.HumanHandoffCard {
  return object(value) && value.type === 'human_handoff' && object(value.data)
    && typeof value.data.label === 'string' && !!value.data.label.trim()
    && (value.data.reason === undefined || typeof value.data.reason === 'string' && value.data.reason.length <= 255);
}

export function parseSupportRoute(value: unknown): Api.RealNotify.SupportRoute {
  if (!object(value) || typeof value.conversationId !== 'string' || !/^[1-9]\d*$/.test(value.conversationId)
    || typeof value.routingVersion !== 'string' || !/^(0|[1-9]\d*)$/.test(value.routingVersion)
    || !['NONE', 'REQUESTED', 'HANDLING'].includes(String(value.interveneStatus))
    || typeof value.aiEnabled !== 'boolean' || value.aiEnabled !== (value.interveneStatus !== 'HANDLING')) {
    throw new Error('客服接待状态不完整，请稍后刷新');
  }
  return { conversationId: value.conversationId, routingVersion: value.routingVersion,
    interveneStatus: value.interveneStatus as Api.RealNotify.InterveneStatus, aiEnabled: value.aiEnabled };
}

/** 同版本只允许 NONE → REQUESTED；接入、转接和结束必须使用更高版本。 */
export function acceptSupportRoute(current: Api.RealNotify.SupportRoute | undefined, next: Api.RealNotify.SupportRoute) {
  if (!current) return true;
  if (next.conversationId !== current.conversationId) return false;
  const previousVersion = BigInt(current.routingVersion), nextVersion = BigInt(next.routingVersion);
  if (nextVersion !== previousVersion) return nextVersion > previousVersion;
  return next.interveneStatus === current.interveneStatus
    || current.interveneStatus === 'NONE' && next.interveneStatus === 'REQUESTED';
}
