import { api } from '@/lib/api';

// Billing / SaaS tier API (Roadmap D5). `status` is provider-agnostic; checkout /
// verify / cancel only work when Razorpay is configured on the server (else 503).
export const billingService = {
  status: () => api.get('/billing/status').then((r) => r.data),
  checkout: () => api.post('/billing/checkout').then((r) => r.data),
  verify: (payload) => api.post('/billing/verify', payload).then((r) => r.data),
  cancel: () => api.post('/billing/cancel').then((r) => r.data),
};

// Lazily inject Razorpay's hosted Checkout script (only when the user upgrades).
export function loadRazorpayCheckout() {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) return resolve(window.Razorpay);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => reject(new Error('Could not load the payment window. Check your connection.'));
    document.body.appendChild(script);
  });
}
