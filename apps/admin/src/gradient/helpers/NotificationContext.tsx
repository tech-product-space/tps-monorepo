"use client";

import React, { createContext, useContext } from "react";
import { toast } from "sonner";
import { CheckCircle, AlertCircle, XCircle } from "lucide-react";

type NotificationType = "success" | "warning" | "error";

interface NotificationContextType {
  showNotification: (
    type: NotificationType,
    title: string,
    description?: string,
    action?: { label: string; onClick: () => void }
  ) => void;
}

const NotificationContext =
  createContext<NotificationContextType | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error(
      "useNotification must be used within a NotificationProvider"
    );
  }
  return context;
};

export const NotificationProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  const showNotification = (
    type: NotificationType,
    title: string,
    description?: string,
    action?: { label: string; onClick: () => void }
  ) => {
    const iconMap = {
      success: (
        <CheckCircle className="h-5 w-5 text-emerald-600" />
      ),
      warning: (
        <AlertCircle className="h-5 w-5 text-yellow-500" />
      ),
      error: (
        <XCircle className="h-5 w-5 text-red-500" />
      ),
    };

    toast(
      <div className="flex items-start gap-3">
        {iconMap[type]}

        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium text-black">
            {title}
          </p>

          {description && (
            <p className="text-xs text-neutral-600 leading-snug">
              {description}
            </p>
          )}
        </div>
      </div>,
      {
        action: action
          ? {
              label: action.label,
              onClick: action.onClick,
            }
          : undefined,
      }
    );
  };

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
    </NotificationContext.Provider>
  );
};
