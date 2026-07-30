import { realUserRequest } from '@/service/request';

export function fetchBuyerApplication() {
  return realUserRequest.get<Api.RealBuyer.BuyerApplicationVO | null>('/buyer/application');
}

export function submitBuyerApplication(params: Api.RealBuyer.BuyerApplyParams) {
  return realUserRequest.post<void, Api.RealBuyer.BuyerApplyParams>('/buyer/apply', params);
}
