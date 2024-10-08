import type { HttpResponse, RequestsAuthenticationRequest } from './api/v1/StreamSinkClient';
import { useAuthStore } from '~/stores/auth';
import { useNuxtApp } from '#app/nuxt';

export interface AuthInfo {
  token: string;
}

export interface AuthHeader {
  Authorization: string;
}

export default class AuthService {
  async login(user: RequestsAuthenticationRequest) {
    const authStore = useAuthStore();
    const { $client } = useNuxtApp();
    const { data } = await $client.auth.loginCreate(user);
    const r = data as unknown as AuthInfo;
    if (r.token) {
      authStore.setToken(r.token);
      authStore.login();
    }
  }

  logout() {
    const authStore = useAuthStore();
    authStore.setToken(null);
    authStore.logout();
  }

  getToken(): string | null {
    const authStore = useAuthStore();
    return authStore.getToken;
  }

  isLoggedIn(): boolean {
    const authStore = useAuthStore();
    return authStore.isLoggedIn;
  }

  async signup(user: RequestsAuthenticationRequest): Promise<HttpResponse<void, string>> {
    const { $client } = useNuxtApp();
    return await $client.auth.signupCreate(user);
  }

  getAuthHeader(): AuthHeader | null {
    const authStore = useAuthStore();
    if (!authStore.getToken) {
      return null;
    }

    return { Authorization: 'Bearer ' + authStore.getToken };
  }
}
