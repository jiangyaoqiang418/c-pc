import { h } from 'vue';
import { InputPassword, Message, Modal } from '@arco-design/web-vue';
import { fetchPayPasswordStatus } from '@/service/api/pay-password';
import { router } from '@/router';

export async function requestPayPassword(returnTo?: string): Promise<string | undefined> {
  const status = await fetchPayPasswordStatus();
  if (!status.hasSet) {
    Message.warning('请先设置支付密码');
    await router.push({ name: 'pay-password', query: { redirect: returnTo || router.currentRoute.value.fullPath } });
    return;
  }
  if (status.locked) {
    const time = status.lockedUntil ? new Date(Number(status.lockedUntil)).toLocaleString() : '';
    Message.error(time ? `支付密码已锁定，请于 ${time} 后重试或重置` : '支付密码已锁定，请稍后重试或重置');
    return;
  }
  let value = '';
  return new Promise(resolve => {
    let settled = false;
    const finish = (result?: string) => { if (!settled) { settled = true; resolve(result); } };
    Modal.confirm({
      title: '请输入支付密码',
      content: () => h(InputPassword, {
        modelValue: value, maxLength: 6, placeholder: '6位数字支付密码', allowClear: true,
        'onUpdate:modelValue': (next: string) => { value = next.replace(/\D/g, '').slice(0, 6); }
      }),
      okText: '确认', cancelText: '取消',
      onBeforeOk: () => {
        if (!/^\d{6}$/.test(value)) { Message.warning('请输入6位数字支付密码'); return false; }
        finish(value); value = ''; return true;
      },
      onCancel: () => { value = ''; finish(); },
      onClose: () => { value = ''; finish(); }
    });
  });
}
