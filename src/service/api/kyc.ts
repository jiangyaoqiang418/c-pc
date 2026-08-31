import { realUserRequest } from '@/service/request';

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
