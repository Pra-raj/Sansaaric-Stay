"use client"

import { ReactNode, createContext, useContext, useMemo, useState } from "react"

interface ChatContextValue{
  isOpen: boolean
  open: () =>void
  close: () => void
  toggle: () => void
}

const ChatContext = createContext<ChatContextValue | undefined>(undefined)


export function ChatProvider({children}: {children: ReactNode}){
  const [isOpen, setIsOpen] = useState(false)


  const value = useMemo<ChatContextValue>(
  () => ({
    isOpen,
    open: () => setIsOpen(true),
    close: () => setIsOpen(false),
    toggle: () => setIsOpen((o) => !o),
  }),
  [isOpen]
);
return <ChatContext.Provider value = {value}>{children}</ChatContext.Provider>
}

export function useChat(){
  const ctx = useContext(ChatContext)
  if(!ctx) throw new Error("useChat must be used within a ChatProvider")
  return ctx
}

