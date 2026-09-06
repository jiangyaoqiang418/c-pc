import { realUserRequest } from '@/service/request';

export async function fetchKycSchema(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  const schema = await realUserRequest.get<Api.RealKyc.Schema>('/kyc/schema', options);
  if (!schema || !Number.isSafeInteger(schema.version) || !Array.isArray(schema.allowedIdTypes) || !schema.allowedIdTypes.length
    || schema.allowedIdTypes.some(type => !['ID_CARD', 'PASSPORT'].includes(type))
    || [schema.nationalityRequired, schema.idCardBackRequired, schema.holdingPhotoRequired, schema.resubmitAfterRejectAllowed].some(value => typeof value !== 'boolean')) {
    throw new Error('实名认证配置不完整，请重新加载后再提交');
  }
  return schema;
}

export function kycSubmissionIssue(schema: Api.RealKyc.Schema | undefined, form: Api.RealKyc.SubmitParams, status?: string) {
  if (!schema) return '请先成功读取实名认证配置';
  if (status === 'pending' || status === 'approved') return '当前认证状态不可重复提交';
  if (status === 'rejected' && !schema.resubmitAfterRejectAllowed) return '当前配置不允许驳回后重新提交，请联系平台';
  if (!schema.allowedIdTypes.includes(form.idType)) return '当前证件类型不再支持，请重新选择';
  if (!form.realName.trim() || !form.idNo.trim() || !form.idCardFrontFileId) return '请填写姓名、证件号码并上传证件资料页';
  if (schema.nationalityRequired && !form.nationality?.trim()) return '请填写国籍';
  if (schema.idCardBackRequired && !form.idCardBackFileId) return '当前配置要求上传证件背面';
  if (schema.holdingPhotoRequired && !form.holdingPhotoFileId) return '当前配置要求上传手持证件照';
  return '';
}

export function fetchMyKycDetail(options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealKyc.KycVO | null>('/kyc/detail', options);
}

export function uploadKycFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return realUserRequest.post<Api.RealKyc.FileUploadResult, FormData>('/kyc/files/upload', form);
}

export function refreshKycFileAccess(fileId: string | number, options: { signal?: AbortSignal; showError?: boolean } = {}) {
  return realUserRequest.get<Api.RealKyc.FileAccessResult>('/kyc/files/access', { params: { fileId }, ...options });
}

export function submitKyc(params: Api.RealKyc.SubmitParams) {
  return realUserRequest.post<string | number, Api.RealKyc.SubmitParams>('/kyc/submit', params);
}
