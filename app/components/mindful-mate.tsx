'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { MoonIcon, SunIcon, SendIcon, LeafIcon, HistoryIcon, MessageCircleIcon, TrashIcon, LinkedinIcon } from 'lucide-react'
import { GoogleGenerativeAI, GenerativeModel, ChatSession, Content } from "@google/generative-ai";
import { useLocalStorage } from '../hooks/use-local-storage'
import { safeParseDate } from '../utils/safeParseDate'
import { formatDate } from '../utils/formatDate'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface Conversation {
  id: string
  title: string
  messages: Message[]
  welcomeMessageSent: boolean
}

export default function EmoBuddy() {
  const [isTyping, setIsTyping] = useState(false)
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [input, setInput] = useState('')
  const [isClient, setIsClient] = useState(false)
  const [conversations, setConversations] = useLocalStorage<Conversation[]>('emobuddy-conversations', [
    {
      id: '1',
      title: 'First Conversation',
      messages: [
        { id: '1', role: 'assistant', content: "Hello, I'm EmoBuddy, your supportive AI companion. How are you feeling today?", timestamp: new Date().toISOString() },
      ],
      welcomeMessageSent: true
    }
  ])
  const [activeConversation, setActiveConversation] = useLocalStorage<string>('emobuddy-active-conversation', '1')
  const [currentTab, setCurrentTab] = useState('chat')
  const [model, setModel] = useState<GenerativeModel | null>(null);
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Add this derived state
  const currentConversation = conversations.find(conv => conv.id === activeConversation);

  useEffect(() => {
    setIsClient(true)
  }, [])

  useEffect(() => {
    const initializeGenAI = async () => {
      const genAI = new GoogleGenerativeAI(process.env.NEXT_PUBLIC_GEMINI_API_KEY as string);

      const model = genAI.getGenerativeModel({
        model: "tunedModels/mental-ai-f1my9p0ommji",
        generationConfig: {
          temperature: 1,
          topP: 0.95,
          topK: 64,
          maxOutputTokens: 300,
        },
      });
      setModel(model);

      // Initialize chat session with current conversation history
      if (currentConversation) {
        const history: Content[] = currentConversation.messages
          .filter(msg => msg.role === 'user' || (msg.role === 'assistant' && !currentConversation.welcomeMessageSent))
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }));

        const chat = model.startChat({
          history: history,
          generationConfig: {
            maxOutputTokens: 300,
          },
        });
        setChatSession(chat);
      }
    };
    initializeGenAI();
  }, [currentConversation]); // Add currentConversation as a dependency

  useEffect(() => {
    scrollToBottom();
  }, [conversations, isTyping]);

  const scrollToBottom = () => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        setTimeout(() => {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }, 0);
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (input.trim() && chatSession && currentConversation) {
      const newMessage: Message = { id: Date.now().toString(), role: 'user', content: input.trim(), timestamp: new Date().toISOString() }
      
      // Update conversations and title in a single state update
      setConversations(prevConversations => {
        const updatedConversations = prevConversations.map(conv => 
          conv.id === activeConversation 
            ? { 
                ...conv, 
                messages: [...conv.messages, newMessage],
                title: conv.title === 'New Conversation' ? (input.length > 30 ? input.substring(0, 30) + '...' : input) : conv.title
              }
            : conv
        )
        return updatedConversations;
      })
      
      setInput('')
      setIsTyping(true)
      
      scrollToBottom();
      
      try {
        const result = await chatSession.sendMessage(input.trim());
        const response = await result.response;
        const text = response.text();
        
        const aiResponse: Message = { 
          id: (Date.now() + 1).toString(), 
          role: 'assistant', 
          content: text, 
          timestamp: new Date().toISOString() 
        }
        setConversations(prevConversations => {
          const updatedConversations = prevConversations.map(conv => 
            conv.id === activeConversation 
              ? { ...conv, messages: [...conv.messages, aiResponse] }
              : conv
          )
          return updatedConversations;
        })
        
        scrollToBottom();
      } catch (error) {
        console.error("Error calling Gemini API:", error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I'm sorry, I'm having trouble responding right now. Please try again later.",
          timestamp: new Date().toISOString()
        }
        setConversations(prevConversations => 
          prevConversations.map(conv => 
            conv.id === activeConversation 
              ? { ...conv, messages: [...conv.messages, errorMessage] }
              : conv
          )
        )
        
        // Scroll to bottom after adding error message
        scrollToBottom();
      } finally {
        setIsTyping(false);
      }
    }
  }

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode)
  }

  const startNewConversation = () => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: `New Conversation`,
      messages: [
        { 
          id: Date.now().toString(), 
          role: 'assistant', 
          content: "Hello, I'm EmoBuddy. How can I support you today?", 
          timestamp: new Date().toISOString() 
        }
      ],
      welcomeMessageSent: true
    }
    setConversations(prevConversations => [...prevConversations, newConversation])
    setActiveConversation(newConversation.id)
    
    // Reset the chat session when starting a new conversation
    if (model) {
      const newChat = model.startChat({
        history: [],
        generationConfig: {
          maxOutputTokens: 300,
        },
      });
      setChatSession(newChat);
    }
  }

  const switchConversation = (conversationId: string) => {
    setActiveConversation(conversationId)
    setCurrentTab('chat')
    
    // Reset the chat session with the selected conversation's history
    if (model) {
      const selectedConversation = conversations.find(conv => conv.id === conversationId);
      if (selectedConversation) {
        const history: Content[] = selectedConversation.messages
          .filter(msg => msg.role === 'user' || (msg.role === 'assistant' && !selectedConversation.welcomeMessageSent))
          .map(msg => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.content }]
          }));
        
        const newChat = model.startChat({
          history: history,
          generationConfig: {
            maxOutputTokens: 300,
          },
        });
        setChatSession(newChat);
      }
    }
  }

  const deleteConversation = (conversationId: string) => {
    setConversations(prevConversations => 
      prevConversations.filter(conv => conv.id !== conversationId)
    )
    if (activeConversation === conversationId) {
      const remainingConversations = conversations.filter(conv => conv.id !== conversationId)
      if (remainingConversations.length > 0) {
        setActiveConversation(remainingConversations[0].id)
      } else {
        startNewConversation()
      }
    }
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''}`}>
      <div className="flex flex-col h-screen bg-gradient-to-b from-green-50 to-green-100 dark:from-green-900 dark:to-green-800 transition-colors duration-300">
        {/* LinkedIn banner */}
        <a
          href="https://www.linkedin.com/in/piyush-kumar-a85653288/"
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-4 right-4 z-10 sm:flex items-center bg-white dark:bg-gray-800 text-blue-600 hover:text-white hover:bg-blue-600 px-2 sm:px-4 py-2 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 hidden"
        >
          <span className="mr-2 font-semibold text-sm hidden sm:inline">Contact the Developer</span>
          <LinkedinIcon className="h-6 w-6" />
        </a>

        <div className="flex-grow overflow-hidden sm:p-4">
          <div className="h-full w-full max-w-4xl mx-auto bg-white/80 dark:bg-gray-800/80 backdrop-blur-md transition-colors duration-300 overflow-hidden sm:shadow-xl sm:rounded-lg flex flex-col">
            <div className="bg-green-100 dark:bg-green-900 p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <LeafIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                <h1 className="text-2xl font-semibold text-green-800 dark:text-green-200">EmoBuddy</h1>
              </div>
              <div className="flex items-center space-x-2">
                {/* LinkedIn icon for mobile */}
                <a
                  href="https://www.linkedin.com/in/piyush-kumar-a85653288/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="sm:hidden flex items-center justify-center w-8 h-8 bg-white dark:bg-gray-800 text-blue-600 hover:text-white hover:bg-blue-600 rounded-full shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                >
                  <LinkedinIcon className="h-4 w-4" />
                </a>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={startNewConversation}
                  className="text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 transition-colors duration-300"
                >
                  New Chat
                </Button>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={toggleDarkMode}
                  className="text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-800 transition-colors duration-300"
                >
                  {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                </Button>
              </div>
            </div>
            <Tabs value={currentTab} onValueChange={setCurrentTab} className="flex-grow flex flex-col">
              <TabsList className="w-full bg-green-50 dark:bg-green-950">
                <TabsTrigger value="chat" className="w-1/2">
                  <MessageCircleIcon className="w-4 h-4 mr-2" />
                  Current Chat
                </TabsTrigger>
                <TabsTrigger value="history" className="w-1/2">
                  <HistoryIcon className="w-4 h-4 mr-2" />
                  Chat History
                </TabsTrigger>
              </TabsList>
              <TabsContent value="chat" className="flex-grow flex flex-col p-0 overflow-hidden">
                <ScrollArea className="flex-grow px-4 py-2">
                  {isClient && currentConversation?.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      } mb-4`}
                    >
                      <div
                        className={`flex items-end ${
                          message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                        } max-w-[80%]`}
                      >
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className={message.role === 'user' ? 'bg-blue-500' : 'bg-green-500'}>
                            {message.role === 'user' ? 'You' : 'AI'}
                          </AvatarFallback>
                          <AvatarImage
                            src={
                              message.role === 'user'
                                ? '/placeholder.svg?height=32&width=32'
                                : '/placeholder.svg?height=32&width=32'
                            }
                            alt={message.role === 'user' ? 'User' : 'AI'}
                          />
                        </Avatar>
                        <div
                          className={`mx-2 p-3 rounded-2xl ${
                            message.role === 'user'
                              ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-100'
                              : 'bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100'
                          } transition-colors duration-300`}
                        >
                          <div>{message.content}</div>
                          <div className="text-xs text-gray-500 mt-2">
                            {formatDate(safeParseDate(message.timestamp))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {isClient && isTyping && (
                    <div className="flex justify-start mb-4">
                      <div className="flex items-center bg-green-100 text-green-900 dark:bg-green-900 dark:text-green-100 max-w-xs p-3 rounded-2xl transition-colors duration-300">
                        <div className="typing-indicator">
                          <span className="dot"></span>
                          <span className="dot"></span>
                          <span className="dot"></span>
                        </div>
                      </div>
                    </div>
                  )}
                </ScrollArea>
                <div className="p-4 bg-green-50/80 dark:bg-green-950/80 backdrop-blur-sm transition-colors duration-300">
                  <form onSubmit={handleSubmit} className="flex w-full space-x-2">
                    <Input
                      value={input}
                      onChange={handleInputChange}
                      placeholder="Share your thoughts..."
                      className="flex-grow bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm text-gray-900 dark:text-gray-100 transition-colors duration-300 border-green-200 dark:border-green-800 focus:ring-green-500 focus:border-green-500"
                    />
                    <Button type="submit" className="bg-green-500 hover:bg-green-600 text-white transition-colors duration-300">
                      <SendIcon className="h-5 w-5" />
                      <span className="sr-only">Send</span>
                    </Button>
                  </form>
                </div>
              </TabsContent>
              <TabsContent value="history" className="flex-grow overflow-hidden">
                <ScrollArea className="h-full px-4 py-2">
                  <div className="space-y-4">
                    {conversations.map((conversation) => (
                      <div key={conversation.id} className="p-3 bg-white dark:bg-gray-700 rounded-lg shadow">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-semibold text-green-800 dark:text-green-200">
                              {conversation.title || 'New Conversation'}
                            </h3>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                              {conversation.messages.length} messages
                            </p>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            onClick={() => deleteConversation(conversation.id)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900"
                          >
                            <TrashIcon className="h-5 w-5" />
                          </Button>
                        </div>
                        <Button 
                          variant="link" 
                          onClick={() => switchConversation(conversation.id)}
                          className="mt-2 text-green-600 dark:text-green-400"
                        >
                          View Conversation
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  )
}