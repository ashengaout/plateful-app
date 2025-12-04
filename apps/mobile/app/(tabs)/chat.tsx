import React, { useState, useEffect, useRef } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@plateful/ui';
import { allColors as colors } from '@plateful/shared';
import type { ChatMessage, ChatConversation } from '@plateful/shared';
import type { IntentExtractionResult } from '@plateful/shared';
import { auth } from '../../src/config/firebase';
import Header from '../../src/components/Header';
import { API_BASE } from '../../src/config/api';

export default function ChatScreen() {
  const params = useLocalSearchParams<{ editingConversationID?: string; pantryInspired?: string }>();
  const [conversationID, setConversationID] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingRecipe, setGeneratingRecipe] = useState(false);
  const [recipeProgress, setRecipeProgress] = useState<string | null>(null);
  const [savingEditedRecipe, setSavingEditedRecipe] = useState(false);
  const [conversation, setConversation] = useState<ChatConversation | null>(null);
  const [currentIntent, setCurrentIntent] = useState<IntentExtractionResult | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const sparkleAnim1 = useRef(new Animated.Value(0)).current;
  const sparkleAnim2 = useRef(new Animated.Value(0)).current;
  const sparkleAnim3 = useRef(new Animated.Value(0)).current;

  // Initialize conversation - check for editing conversation first
  useEffect(() => {
    if (!auth.currentUser) return;

    // If we have an editingConversationID param and it's different from current, switch to it
    if (params.editingConversationID) {
      if (params.editingConversationID !== conversationID) {
        // Clear existing state and switch to the editing conversation
        setMessages([]);
        setConversation(null);
        setCurrentIntent(null);
        setConversationID(params.editingConversationID);
      }
      return;
    }

    // If no conversationID exists, start a new conversation
    if (!conversationID) {
      const timer = setTimeout(() => {
        startNewConversation();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [params.editingConversationID, params.pantryInspired, conversationID]);

  // Load messages when conversationID changes
  useEffect(() => {
    if (conversationID && auth.currentUser) {
      loadMessages();
      loadConversation();
    }
  }, [conversationID]);

  const loadMessages = async (convID?: string) => {
    const idToUse = convID || conversationID;
    if (!idToUse) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/chat?action=messages&conversationID=${idToUse}`);
      if (response.ok) {
        const data = await response.json();
        const loadedMessages = data.messages || [];
        
        // Deduplicate messages by ID to prevent duplicates
        const uniqueMessages = loadedMessages.reduce((acc: ChatMessage[], msg: ChatMessage) => {
          const existing = acc.find(m => m.id === msg.id);
          if (!existing) {
            acc.push(msg);
          }
          return acc;
        }, []);
        
        // Sort by timestamp to ensure correct order
        uniqueMessages.sort((a: ChatMessage, b: ChatMessage) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );
        
        setMessages(uniqueMessages);
      }
    } catch (error) {
      console.error('Failed to load messages:', error);
    }
  };

  const loadConversation = async () => {
    if (!conversationID) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/chat?action=conversation&conversationID=${conversationID}`);
      if (response.ok) {
        const data = await response.json();
        setConversation(data.conversation);
      }
    } catch (error) {
      console.error('Failed to load conversation:', error);
    }
  };

  // Sparkle animation effect
  useEffect(() => {
    if (currentIntent && currentIntent.certaintyLevel !== 'low') {
      const createSparkleAnimation = (animValue: Animated.Value, delay: number) => {
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(animValue, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(animValue, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.delay(1000),
          ])
        );
      };

      createSparkleAnimation(sparkleAnim1, 0).start();
      createSparkleAnimation(sparkleAnim2, 200).start();
      createSparkleAnimation(sparkleAnim3, 400).start();
    }
  }, [currentIntent?.certaintyLevel]);

  const startNewConversation = async () => {
    if (!auth.currentUser) {
      Alert.alert('Error', 'Please sign in to use chat');
      return;
    }

    try {
      // Clear current intent when starting new conversation
      setCurrentIntent(null);
      
      console.log(`🔄 Creating conversation for user ${auth.currentUser.uid}...`);
      console.log(`📡 API Base URL: ${API_BASE}`);
      
      const response = await fetch(`${API_BASE}/api/chat?action=conversation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userID: auth.currentUser.uid }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Conversation creation failed (${response.status}):`, errorData);
        console.error(`📡 Full response:`, response);
        
        if (response.status === 503) {
          throw new Error('Chat service unavailable - Cosmos DB not configured. Check your .env file.');
        }
        
        // Check if it's a network error
        if (response.status === 0 || !response.status) {
          throw new Error(`Cannot connect to API server. Make sure the API is running at ${API_BASE}`);
        }
        
        throw new Error(`Failed to create conversation: ${response.statusText || 'Unknown error'}`);
      }

      const data = await response.json();
      console.log('🎯 Conversation created:', data);
      
      if (!data.conversation || !data.conversation.conversationID) {
        throw new Error('Invalid response from server - no conversation ID received');
      }
      
      const newConvID = data.conversation.conversationID;
      
      // Clear messages FIRST before updating conversationID to prevent race conditions
      setMessages([]);
      
      // Update conversationID - this will trigger useEffect to load messages
      setConversationID(newConvID);
      setConversation(data.conversation);
      
      // Check if this is an editing conversation - if so, don't send greeting
      // (greeting is sent by load-recipe endpoint)
      if (data.conversation.status !== 'editing_recipe') {
        const isPantryInspired = params.pantryInspired === 'true';
        if (isPantryInspired) {
          // Auto-send pantry-inspired message
          const pantryMessage = "Find recipes inspired by my pantry ingredients";
          await sendUserMessage(newConvID, pantryMessage, false);
          // Get AI response after a short delay to ensure message is saved
          setTimeout(async () => {
            await loadMessages(newConvID); // Load the user message first, pass conversationID directly
            // Call AI response with the conversationID directly
            const aiResponse = await getAIResponseForConversation(newConvID, true);
            await sendAssistantMessage(newConvID, aiResponse, false);
            await loadMessages(newConvID); // Load both messages, pass conversationID directly
            setTimeout(() => extractCurrentIntent(), 500);
          }, 500);
        } else {
          // Send initial greeting (don't add to local state - let loadMessages handle it)
          await sendAssistantMessage(
            newConvID,
            "Hi! I'm here to help you discover delicious recipes. What kind of meal are you in the mood for today?",
            false // Don't add to local state
          );
          // The useEffect will call loadMessages() when conversationID changes, no need for setTimeout
        }
      }
    } catch (error) {
      console.error('❌ Failed to start conversation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // More helpful error messages
      let userFriendlyMessage = errorMessage;
      if (errorMessage.includes('Cannot connect') || errorMessage.includes('fetch')) {
        userFriendlyMessage = `Cannot connect to API server at ${API_BASE}. Make sure the API is running or set EXPO_PUBLIC_API_URL in your .env file.`;
      }
      
      Alert.alert('Error', `Failed to start chat: ${userFriendlyMessage}`);
      throw error; // Re-throw so caller knows it failed
    }
  };

  const sendUserMessage = async (convID: string, content: string, addToLocalState: boolean = true) => {
    try {
      console.log(`📤 Sending user message to ${convID}`);
      
      const response = await fetch(`${API_BASE}/api/chat?action=message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID: convID,
          role: 'user',
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ User message failed (${response.status}):`, errorData);
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ User message sent:', data);
      console.log('📨 Message object:', data.message);
      
      // Only add to local state if requested
      if (addToLocalState && data.message) {
        setMessages(prev => [...prev, data.message]);
      } else if (!data.message) {
        console.error('❌ No message in user response:', data);
      }
    } catch (error) {
      console.error('❌ Failed to send user message:', error);
    }
  };

  const sendAssistantMessage = async (convID: string, content: string, addToLocalState: boolean = true) => {
    try {
      console.log(`📤 Sending assistant message to ${convID}`);
      
      const response = await fetch(`${API_BASE}/api/chat?action=message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID: convID,
          role: 'assistant',
          content,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error(`❌ Assistant message failed (${response.status}):`, errorData);
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Assistant message sent:', data);
      console.log('📨 Message object:', data.message);
      
      // Only add to local state if requested (skip for initial greeting to avoid duplicates)
      if (addToLocalState && data.message) {
        setMessages(prev => [...prev, data.message]);
      } else if (!data.message) {
        console.error('❌ No message in assistant response:', data);
      }
    } catch (error) {
      console.error('❌ Failed to send assistant message:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim()) {
      return;
    }

    // If no conversation exists, try to create one first
    if (!conversationID) {
      console.log('⚠️ No conversationID, attempting to create one...');
      try {
        await startNewConversation();
        // Wait a bit for conversation to be created
        await new Promise(resolve => setTimeout(resolve, 300));
        // If still no conversationID after creation attempt, show error
        if (!conversationID) {
          Alert.alert(
            'Error',
            'Failed to start conversation. Please check your connection and try again.',
            [{ text: 'OK' }]
          );
          return;
        }
      } catch (error) {
        console.error('❌ Failed to create conversation for message:', error);
        Alert.alert(
          'Error',
          'Failed to start conversation. Please try the "New Chat" button first.',
          [{ text: 'OK' }]
        );
        return;
      }
    }

    const userMessage = inputText.trim();
    setInputText('');
    setLoading(true);

    try {
      console.log(`📤 Sending user message...`);
      
      // Send user message
      const userResponse = await fetch(`${API_BASE}/api/chat?action=message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID,
          role: 'user',
          content: userMessage,
        }),
      });

      if (!userResponse.ok) {
        const errorData = await userResponse.json().catch(() => ({}));
        console.error('❌ User message response error:', errorData);
        throw new Error(`Failed to send message: ${userResponse.statusText}`);
      }

      const userData = await userResponse.json();
      console.log('✅ User message sent:', userData);
      console.log('📨 Message object:', userData.message);
      
      if (userData.message) {
        setMessages(prev => [...prev, userData.message]);
      } else {
        console.error('❌ No message in response:', userData);
      }

      // Check if message mentions pantry
      const messageLower = userMessage.toLowerCase();
      const mentionsPantry = messageLower.includes('pantry') || 
                             messageLower.includes('what i have') ||
                             messageLower.includes('ingredients i have') ||
                             messageLower.includes('using my pantry') ||
                             messageLower.includes('based on my pantry') ||
                             messageLower.includes('from my pantry') ||
                             messageLower.includes('with what i have');

      // Get AI response
      const aiResponse = await getAIResponse([...messages, userData.message], mentionsPantry);
      await sendAssistantMessage(conversationID, aiResponse);
      
      // Extract current intent after conversation update
      setTimeout(() => extractCurrentIntent(), 500);
    } catch (error) {
      console.error('❌ Failed to send message:', error);
      Alert.alert('Error', 'Failed to send message. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getAIResponseForConversation = async (convID: string, includePantry: boolean = false): Promise<string> => {
    try {
      const shouldIncludePantry = includePantry || params.pantryInspired === 'true';
      console.log('🤖 Calling real AI for response...');
      console.log(`📦 includePantry flag: ${shouldIncludePantry} (includePantry param: ${includePantry}, pantryInspired: ${params.pantryInspired})`);
      
      const response = await fetch(`${API_BASE}/api/chat?action=ai-response`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID: convID,
          userID: auth.currentUser?.uid,
          includePantry: shouldIncludePantry,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('❌ AI response failed:', errorData);
        throw new Error(`AI response failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ AI response received:', data.response);
      
      return data.response || "I'm here to help you find delicious recipes! What are you in the mood for?";
      
    } catch (error) {
      console.error('❌ Failed to get AI response:', error);
      // Fallback to a simple response if AI fails
      return "I'm here to help you find delicious recipes! What are you in the mood for?";
    }
  };

  const getAIResponse = async (messageHistory: ChatMessage[], includePantry: boolean = false): Promise<string> => {
    if (!conversationID) {
      console.error('❌ No conversationID available');
      return "I'm here to help you find delicious recipes! What are you in the mood for?";
    }
    return getAIResponseForConversation(conversationID, includePantry);
  };

  const extractCurrentIntent = async () => {
    if (!conversationID || messages.length === 0 || !auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/extract-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID,
          userID: auth.currentUser.uid,
        }),
      });

      if (response.ok) {
        const intent = await response.json();
        setCurrentIntent(intent);
        console.log('🧠 Current intent updated:', intent);
      }
    } catch (error) {
      console.error('❌ Failed to extract intent:', error);
    }
  };

  const generateRecipe = async () => {
    if (!conversationID || !auth.currentUser) return;

    setGeneratingRecipe(true);
    setRecipeProgress('🔍 Starting recipe search...');

    try {
      console.log(`🔄 Generating recipe for conversation ${conversationID}...`);
      
      // Recipe generation involves AI calls, web scraping, formatting, and substitutions
      // Allow up to 120 seconds (2 minutes) to account for multiple recipe attempts
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 120 second timeout
      
      // Simulate progress updates (we can't get real-time updates from the API without websockets)
      const progressInterval = setInterval(() => {
        setRecipeProgress(prev => {
          if (prev === '🔍 Starting recipe search...') return '🔍 Searching for recipes matching your preferences...';
          if (prev === '🔍 Searching for recipes matching your preferences...') return '📄 Getting recipe details...';
          if (prev === '📄 Getting recipe details...') return '🎨 Formatting recipe...';
          return prev; // Keep last message
        });
      }, 5000); // Update every 5 seconds
      
      let response: Response;
      try {
        response = await fetch(`${API_BASE}/api/generate-recipe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationID,
            userID: auth.currentUser.uid,
            includePantry: params.pantryInspired === 'true',
          }),
          signal: controller.signal,
        });
        
        clearInterval(progressInterval);

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Handle timeout errors (504 Gateway Timeout, 408 Request Timeout)
          if (response.status === 504 || response.status === 408) {
            const errorMessage = errorData.message || errorData.error || 'Recipe generation took too long. Please try again with a simpler request or a different dish.';
            console.error('⏱️ Recipe generation timed out:', errorData);
            Alert.alert('Request Timeout', errorMessage);
            return;
          }
          
          // Handle off-topic conversations
          if (response.status === 400 && errorData.error === 'Off-topic conversation') {
            Alert.alert(
              'Not About Cooking',
              errorData.message || 'Let\'s talk about food! Ask me about a dish or cuisine you\'d like to cook.',
              [{ text: 'OK' }]
            );
            return;
          }
          
          // Handle Cosmos DB unavailable
          if (response.status === 503) {
            const errorMessage = errorData.message || errorData.error || 'Recipe generation service not available. Please check your database configuration.';
            console.error('❌ Recipe generation service unavailable:', errorData);
            Alert.alert('Service Unavailable', errorMessage);
            return;
          }
          
          // Extract user-friendly error message
          const errorMessage = errorData.message || errorData.error || errorData.details || `Failed to generate recipe: ${response.statusText}`;
          console.error('❌ Recipe generation failed:', response.status, errorData);
          throw new Error(errorMessage);
        }
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Recipe generation timed out. Please try again.');
        }
        throw error;
      }

      const data = await response.json();
      console.log('✅ Recipe generated:', data);
      setRecipeProgress(null);
      
      Alert.alert(
        'Recipe Found!',
        `I found a recipe for ${data.intent.dish}! Check it out in the Recipes tab.`,
        [
          { text: 'Start New Chat', onPress: startNewConversation },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('❌ Failed to generate recipe:', error);
      setRecipeProgress(null);
      
      // Extract error message
      let errorMessage = 'Failed to generate recipe.';
      
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Provide helpful context based on error message
      if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorMessage.includes('Request timeout')) {
        errorMessage = 'Recipe generation took too long. Please try again with a simpler request or a different dish.';
      } else if (errorMessage.includes('Cannot connect') || errorMessage.includes('fetch')) {
        errorMessage = `Cannot connect to API server at ${API_BASE}. Make sure the API is running.`;
      } else if (errorMessage.includes('Cosmos') || errorMessage.includes('Database')) {
        errorMessage = 'Database service unavailable. Please check your configuration.';
      } else if (!errorMessage.includes('Failed to generate recipe')) {
        // If we have a specific error message, use it; otherwise add context
        errorMessage = `Failed to generate recipe: ${errorMessage}`;
      }
      
      Alert.alert('Error', errorMessage);
    } finally {
      setGeneratingRecipe(false);
      setRecipeProgress(null);
    }
  };

  const saveEditedRecipe = async () => {
    if (!conversationID || !auth.currentUser) return;

    setSavingEditedRecipe(true);

    try {
      console.log(`💾 Saving edited recipe for conversation ${conversationID}...`);
      
      const response = await fetch(`${API_BASE}/api/chat?action=save-edited-recipe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationID,
          userID: auth.currentUser.uid,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Failed to save edited recipe: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Edited recipe saved:', data);
      
      Alert.alert(
        'Recipe Saved!',
        'Your edited recipe has been saved as a new recipe. Check it out in the Recipes tab!',
        [
          { text: 'Start New Chat', onPress: startNewConversation },
          { text: 'OK', style: 'cancel' },
        ]
      );
    } catch (error) {
      console.error('❌ Failed to save edited recipe:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save edited recipe';
      Alert.alert('Error', errorMessage);
    } finally {
      setSavingEditedRecipe(false);
    }
  };

  const getButtonText = () => {
    if (generatingRecipe) return "Generating Recipe...";
    if (!currentIntent) return "✨ Find Recipe";
    
    // Low confidence = broad category = random/surprise
    if (currentIntent.certaintyLevel === 'low') return "🎲 Surprise Me";
    
    // Medium/High confidence = specific dish = precise search
    return "✨ Find Recipe";
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <Header title="Recipe Chat" />
      <View style={styles.newChatContainer}>
        <TouchableOpacity onPress={startNewConversation} style={styles.newChatButton}>
          <Ionicons name="add-circle-outline" size={24} color={colors.primary} />
          <Text style={styles.newChatText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      {/* Sticky Intent Banner */}
      {currentIntent && currentIntent.status !== 'off_topic' && currentIntent.status !== 'kitchen_utility' && (
        <View style={styles.intentBanner}>
          <Text style={styles.intentText}>
            💭 {currentIntent.explanation || `I'm thinking you want ${currentIntent.dish}`}
          </Text>
        </View>
      )}

      <ScrollView
        ref={scrollViewRef}
        style={styles.messagesContainer}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: false })}
      >
        {messages.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="chatbubbles-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyStateTitle}>Start a conversation</Text>
            <Text style={styles.emptyStateText}>Ask me about any dish or cuisine you'd like to try!</Text>
          </View>
        ) : (
          messages.map((message, index) => {
            // Create unique key combining id, index, and timestamp to avoid duplicates
            const uniqueKey = message.id 
              ? `${message.id}-${index}` 
              : `msg-${index}-${message.timestamp || Date.now()}`;
            
            return (
          <View
            key={uniqueKey}
            style={[
              styles.messageBubble,
              message.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                message.role === 'user' ? styles.userText : styles.assistantText,
              ]}
            >
              {message.content.split('\n').map((line, i) => {
                // Parse markdown bold (**text**)
                const parts = line.split(/(\*\*[^*]+\*\*)/g);
                return (
                  <Text key={i}>
                    {parts.map((part, j) => {
                      if (part.startsWith('**') && part.endsWith('**')) {
                        return (
                          <Text key={j} style={{ fontWeight: 'bold' }}>
                            {part.slice(2, -2)}
                          </Text>
                        );
                      }
                      return <Text key={j}>{part}</Text>;
                    })}
                    {i < message.content.split('\n').length - 1 && '\n'}
                  </Text>
                );
              })}
            </Text>
            <Text
              style={[
                styles.timestamp,
                message.role === 'user' ? styles.userTimestamp : styles.assistantTimestamp,
              ]}
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
            );
          })
        )}
        {loading && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color={colors.textSecondary} />
            <Text style={styles.loadingText}>Thinking...</Text>
          </View>
        )}
        {generatingRecipe && recipeProgress && (
          <View style={styles.loadingBubble}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.loadingText}>{recipeProgress}</Text>
          </View>
        )}
      </ScrollView>

      {conversation?.status === 'editing_recipe' && 
       messages.length > 2 && 
       messages.filter(m => m.role === 'user').length > 0 && (
        <View style={styles.recipeButtonContainer}>
          <Button
            title={savingEditedRecipe ? "Saving..." : "💾 Save Edited Recipe"}
            onPress={saveEditedRecipe}
            loading={savingEditedRecipe}
            variant="primary"
            disabled={savingEditedRecipe}
          />
        </View>
      )}

      {messages.length > 2 && currentIntent && 
       currentIntent.status !== 'kitchen_utility' && 
       currentIntent.status !== 'off_topic' &&
       conversation?.status !== 'editing_recipe' && (
        <View style={styles.recipeButtonContainer}>
          <Button
            title={getButtonText()}
            onPress={generateRecipe}
            loading={generatingRecipe}
            variant={currentIntent?.certaintyLevel !== 'low' ? 'gold' : 'primary'}
            disabled={generatingRecipe}
          />
          {currentIntent.certaintyLevel !== 'low' && (
            <View style={styles.sparkleContainer}>
              <Animated.View
                style={[
                  styles.sparkleDot,
                  styles.sparkle1,
                  {
                    opacity: sparkleAnim1,
                    transform: [{
                      scale: sparkleAnim1.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.2],
                      }),
                    }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.sparkleDot,
                  styles.sparkle2,
                  {
                    opacity: sparkleAnim2,
                    transform: [{
                      scale: sparkleAnim2.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.2],
                      }),
                    }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.sparkleDot,
                  styles.sparkle3,
                  {
                    opacity: sparkleAnim3,
                    transform: [{
                      scale: sparkleAnim3.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.5, 1.2],
                      }),
                    }],
                  },
                ]}
              />
            </View>
          )}
        </View>
      )}

      <View style={styles.inputContainer}>
        <TextInput
          style={styles.input}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Type your message..."
          placeholderTextColor="#9E9E9E"
          multiline
          maxLength={500}
          editable={!loading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (!inputText.trim() || loading) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={!inputText.trim() || loading}
        >
          <Ionicons
            name="send"
            size={20}
            color={!inputText.trim() || loading ? colors.disabled : colors.surface}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  newChatContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  newChatButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
  },
  newChatText: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
  intentBanner: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  intentText: {
    fontSize: 14,
    color: colors.textPrimary,
  },
  sparkleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sparkleDot: {
    position: 'absolute',
    width: 4,
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 2,
  },
  sparkle1: {
    top: '30%',
    left: '25%',
  },
  sparkle2: {
    top: '60%',
    right: '30%',
  },
  sparkle3: {
    top: '20%',
    right: '20%',
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    gap: 12,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: colors.userBubble,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.botBubble,
    borderWidth: 1,
    borderColor: colors.border,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
  },
  userText: {
    color: colors.textPrimary,
  },
  assistantText: {
    color: colors.textPrimary,
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  userTimestamp: {
    color: colors.textSecondary,
    textAlign: 'right',
  },
  assistantTimestamp: {
    color: colors.textSecondary,
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.botBubble,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyStateTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 20,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 16,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
  },
  recipeButtonContainer: {
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 12,
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 100,
    color: colors.textPrimary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: colors.border,
  },
});

