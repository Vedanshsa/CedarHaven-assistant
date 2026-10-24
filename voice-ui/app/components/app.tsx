"use client";

import type { AppConfig } from "@/app-config";
import { AccountChat } from "@/app/components/account-chat";

export function App({ appConfig }: { appConfig: AppConfig }) {
  return <AccountChat appConfig={appConfig} />;
}
