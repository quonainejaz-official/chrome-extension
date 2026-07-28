import type { ToBackgroundMessage, FromBackgroundMessage } from '../../shared/types';

export function sendMessageToBackground(message: ToBackgroundMessage): Promise<FromBackgroundMessage> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: FromBackgroundMessage) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else if (!response) {
        reject(new Error('No response from background'));
      } else {
        resolve(response);
      }
    });
  });
}
