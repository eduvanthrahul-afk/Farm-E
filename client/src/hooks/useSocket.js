import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from '@/auth/useAuth';
import { getAccessToken, subscribeAccessToken } from '@/auth/tokenStore';

let sharedSocket = null;
let sharedUserId = null;
const subscribers = new Set();

const publishSocketChange = () => subscribers.forEach((listener) => listener());
const subscribeSocket = (listener) => {
  subscribers.add(listener);
  return () => subscribers.delete(listener);
};
const getSocketSnapshot = () => sharedSocket;
const getConnectedSnapshot = () => Boolean(sharedSocket?.connected);

const disconnectSharedSocket = () => {
  const oldSocket = sharedSocket;
  sharedSocket = null;
  sharedUserId = null;
  if (oldSocket) {
    oldSocket.off('connect', publishSocketChange);
    oldSocket.off('disconnect', publishSocketChange);
    oldSocket.off('connect_error', publishSocketChange);
    oldSocket.disconnect();
  }
  publishSocketChange();
};

// A cleared access token means the session ended or refresh failed. Tear down
// the authenticated socket immediately, even if the chat component unmounted.
subscribeAccessToken((token) => {
  if (!token) {
    disconnectSharedSocket();
    return;
  }
  if (sharedSocket) {
    // Socket.IO calls this for every initial connection and reconnection, so it
    // always uses the newest token after an HTTP refresh.
    sharedSocket.auth = (callback) => callback({ token: getAccessToken() });
  }
});

export const useSocket = () => {
  const { user } = useAuth();
  const userId = user?._id?.toString();
  const socket = useSyncExternalStore(subscribeSocket, getSocketSnapshot, () => null);
  const connected = useSyncExternalStore(subscribeSocket, getConnectedSnapshot, () => false);

  useEffect(() => {
    const token = getAccessToken();
    if (!userId || !token) {
      disconnectSharedSocket();
      return;
    }

    if (sharedSocket && sharedUserId !== userId) disconnectSharedSocket();

    if (!sharedSocket) {
      sharedUserId = userId;
      sharedSocket = io('/', {
        auth: (callback) => callback({ token: getAccessToken() }),
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      });
      sharedSocket.on('connect', publishSocketChange);
      sharedSocket.on('disconnect', publishSocketChange);
      sharedSocket.on('connect_error', publishSocketChange);
      publishSocketChange();
    }
  }, [userId]);

  const emit = useCallback((event, data) => {
    // Socket.IO buffers normal emits while disconnected. This keeps room joins
    // and leaves from being silently dropped during initial connect or recovery.
    sharedSocket?.emit(event, data);
  }, []);

  const on = useCallback((event, handler) => {
    const targetSocket = sharedSocket;
    if (!targetSocket) return () => {};
    targetSocket.on(event, handler);
    return () => targetSocket.off(event, handler);
  }, []);

  const off = useCallback((event, handler) => {
    sharedSocket?.off(event, handler);
  }, []);

  return { socket, connected, emit, on, off };
};
