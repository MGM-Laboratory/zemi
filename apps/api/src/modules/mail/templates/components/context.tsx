import { createContext, useContext } from 'react';

/** URLs the layout needs. MailService provides them, so templates never read config. */
export interface EmailContextValue {
  webUrl: string;
  apiUrl: string;
}

export const EmailContext = createContext<EmailContextValue>({
  webUrl: 'https://zemi.labmgm.org',
  apiUrl: 'https://api.zemi.labmgm.org',
});

export const useEmailContext = () => useContext(EmailContext);
