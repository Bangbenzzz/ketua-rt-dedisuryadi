export type Notice = {
    type: 'success' | 'error' | 'info' | 'warning';
    title?: string;
    message: string;
  };