import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';
import { defineConfig, loadEnv, type ProxyOptions } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

function createProxy(env: Record<string, string>): Record<string, string | ProxyOptions> {
  const adminTarget = env.VITE_REAL_ADMIN_TARGET_URL || 'https://testhou.merchantsale.store/api/admin';
  const userTarget = env.VITE_REAL_USER_TARGET_URL || 'https://testhou.merchantsale.store/api/user';
  const orderTarget = env.VITE_REAL_ORDER_TARGET_URL || 'https://testhou.merchantsale.store/api/order';
  const notifyTarget = env.VITE_REAL_NOTIFY_TARGET_URL || 'https://testhou.merchantsale.store/api/notify';

  return {
    [env.VITE_REAL_ADMIN_BASE_URL || '/api/admin']: {
      target: adminTarget,
      changeOrigin: true,
      rewrite: path => path.replace(env.VITE_REAL_ADMIN_BASE_URL || '/api/admin', '')
    },
    [env.VITE_REAL_USER_BASE_URL || '/api/user']: {
      target: userTarget,
      changeOrigin: true,
      rewrite: path => path.replace(env.VITE_REAL_USER_BASE_URL || '/api/user', '')
    },
    [env.VITE_REAL_ORDER_BASE_URL || '/api/order']: {
      target: orderTarget,
      changeOrigin: true,
      rewrite: path => path.replace(env.VITE_REAL_ORDER_BASE_URL || '/api/order', '')
    },
    [env.VITE_REAL_NOTIFY_BASE_URL || '/api/notify']: {
      target: notifyTarget,
      changeOrigin: true,
      rewrite: path => path.replace(env.VITE_REAL_NOTIFY_BASE_URL || '/api/notify', '')
    }
  };
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd());
  const proxy = command === 'serve' ? createProxy(env) : undefined;

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@shared': fileURLToPath(new URL('./src/mock', import.meta.url))
      }
    },
    server: {
      port: 5173,
      open: false,
      proxy
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@arco-design')) return 'arco';
            if (id.includes('echarts') || id.includes('vue-echarts')) return 'charts';
            if (id.includes('@iconify')) return 'icons';
            if (id.includes('/vue/') || id.includes('/pinia/') || id.includes('/vue-router/')) return 'vue-vendor';
          }
        }
      }
    }
  };
});
