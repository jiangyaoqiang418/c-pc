declare namespace Api.RealFlashSale {
  interface SessionDTO {
    id: string;
    name: string;
    startTime: string;
    endTime: string;
    enabled?: boolean;
    sortOrder?: number;
    itemCount?: number;
    createdAt?: string;
  }

  interface EnrollmentDTO {
    productId: string;
    title: string;
    image?: string;
    price?: string | number;
    flashPrice?: string | number;
    flashStock?: number;
    stock?: number;
    salesCount?: string | number;
    sessionId: string;
    sessionEndTime?: string;
  }

  interface EnrollParams {
    sessionId: string;
    productId: string;
    flashPrice?: number;
    flashStock?: number;
  }
}
