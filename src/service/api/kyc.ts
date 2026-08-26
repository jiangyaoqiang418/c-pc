import { realUserRequest } from '@/service/request';

export function fetchMyKycDetail() {
  return realUserRequest.get<Api.RealKyc.KycVO | null>('/kyc/detail');
}

export function uploadKycFile(file: File) {
  const form = new FormData();
  form.append('file', file);
  return realUserRequest.post<Api.RealKyc.FileUploadResult, FormData>('/kyc/files/upload', form);
}

export function refreshKycFileAccess(fileId: string | number) {
  return realUserRequest.get<Api.RealKyc.FileAccessResult>('/kyc/files/access', { params: { fileId } });
}

export function submitKyc(params: Api.RealKyc.SubmitParams) {
  return realUserRequest.post<string | number, Api.RealKyc.SubmitParams>('/kyc/submit', params);
}
