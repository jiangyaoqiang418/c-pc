import { realOrderRequest } from '@/service/request';
const prefix = '/detail-studio';
export const fetchDetailCapability = () => realOrderRequest.get<Api.DetailStudio.Capability>(prefix + '/capability');
export const fetchDetailRevision = (id: string) => realOrderRequest.get<Api.DetailStudio.Revision>(prefix + '/designs/detail', { params: { id } });
export const saveDetailRevision = (data: { documentKey: string; parentId?: string; sourceJson: string; description: string }) => realOrderRequest.post<Api.DetailStudio.Revision>(prefix + '/designs/create', data);
export const createDetailTask = (data: { requestKey: string; inputJson: string }) => realOrderRequest.post<Api.DetailStudio.Task>(prefix + '/tasks/create', data);
export const fetchDetailTask = (id: string) => realOrderRequest.get<Api.DetailStudio.Task>(prefix + '/tasks/detail', { params: { id } });
export const fetchLatestDetailTask = () => realOrderRequest.get<Api.DetailStudio.Task | null>(prefix + '/tasks/latest');
export const cancelDetailTask = (id: string) => realOrderRequest.post<Api.DetailStudio.Task>(prefix + '/tasks/cancel', { id });

export const fetchProductPreview = (ticket: string) => realOrderRequest.get<Api.RealProduct.ProductDTO>('/storefront/product-preview/detail', { params: { ticket } });
