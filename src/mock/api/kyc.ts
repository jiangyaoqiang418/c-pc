/**
 * KYC mock API：状态查询 / 提交认证。
 */
import { SUBMISSIONS, appendSubmission, findSubmission } from '../mock/data/kyc-submissions';
import { findUserById } from '../mock/data/users';
import { delay } from '../utils/mock-delay';

export async function fetchMyKycStatus(userId: number): Promise<{
  status: Api.User.KycStatus;
  submission?: Api.Kyc.Submission;
}> {
  const user = findUserById(userId);
  if (!user) return delay({ status: 'none' });
  const submission = SUBMISSIONS.filter(s => s.userId === userId).pop();
  return delay({ status: user.kycStatus, submission });
}

export interface SubmitKycParams {
  userId: number;
  idCardFront: string;
  idCardBack: string;
  faceImage: string;
  phone: string;
  realName: string;
  idNumber: string;
}

export async function submitKycMock(p: SubmitKycParams): Promise<{ ok: boolean; submissionId?: number }> {
  const user = findUserById(p.userId);
  if (!user) return delay({ ok: false });
  user.kycStatus = 'pending';
  const sub: Api.Kyc.Submission = {
    id: SUBMISSIONS.length + 1,
    userId: p.userId,
    userName: user.nickname,
    userEmail: user.email,
    audience: user.isBuyer ? 'buyer' : 'customer',
    schemaVersion: 1,
    status: 'pending',
    submittedAt: new Date().toISOString(),
    fields: [
      { fieldId: 'realName', fieldCode: 'realName', fieldLabel: '姓名', type: 'text', value: p.realName },
      { fieldId: 'idNumber', fieldCode: 'idNumber', fieldLabel: '身份证号', type: 'text', value: p.idNumber },
      { fieldId: 'idCardFront', fieldCode: 'idCardFront', fieldLabel: '身份证正面', type: 'image', value: p.idCardFront },
      { fieldId: 'idCardBack', fieldCode: 'idCardBack', fieldLabel: '身份证反面', type: 'image', value: p.idCardBack },
      { fieldId: 'faceImage', fieldCode: 'faceImage', fieldLabel: '人脸', type: 'image', value: p.faceImage },
      { fieldId: 'phone', fieldCode: 'phone', fieldLabel: '手机号', type: 'text', value: p.phone }
    ],
    history: []
  };
  appendSubmission(sub);
  return delay({ ok: true, submissionId: sub.id }, 700);
}

void findSubmission;
