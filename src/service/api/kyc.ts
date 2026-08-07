import { realUserRequest } from '@/service/request';

export function fetchMyKycDetail() {
  return realUserRequest.get<Api.RealKyc.KycVO | null>('/kyc/detail');
}

export function submitKyc(params: Api.RealKyc.SubmitParams) {
  return realUserRequest.post<string | number, Api.RealKyc.SubmitParams>('/kyc/submit', params);
}
