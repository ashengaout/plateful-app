import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@plateful/shared';
import { Text, View, Platform } from 'react-native';

const TabLabel = ({ focused, label }: { focused: boolean; label: string }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <View
      style={{
        paddingHorizontal: 4,
        paddingVertical: 2,
        borderRadius: 5,
        backgroundColor: focused ? colors.primary : 'transparent',
        borderBottomWidth: focused ? 2 : 0,
        borderBottomColor: focused ? colors.primary : 'transparent',
      }}
    >
      <Text 
        style={{ 
          fontSize: 10, 
          fontWeight: '700', 
          color: focused ? '#ffffff' : '#424242',
        }}
        numberOfLines={1}
        adjustsFontSizeToFit={false}
      >
        {label}
      </Text>
    </View>
  </View>
);

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: '#9E9E9E',
        headerShown: false,
        tabBarStyle: {
          borderTopWidth: 0.5,
          borderTopColor: 'rgba(0, 0, 0, 0.1)',
          paddingHorizontal: 12,
          paddingBottom: 8,
          paddingTop: 4,
          height: Platform.OS === 'android' ? 85 : 65,
          ...(Platform.OS === 'android' && { paddingBottom: 32 }),
        },
        tabBarIconStyle: {
          marginTop: 4,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        tabBarLabelStyle: {
          marginTop: 2,
          marginBottom: 2,
        },
      })}
      sceneContainerStyle={{}}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Home" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="home"
              size={size}
              color={color}
              style={
                focused
                  ? { transform: [{ scale: 1.1 }] }
                  : {}
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="groceries"
        options={{
          title: 'Groceries',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Groceries" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="cart"
              size={size}
              color={color}
              style={
                focused
                  ? { transform: [{ scale: 1.1 }] }
                  : {}
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="recipes"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="pantry"
        options={{
          href: null, // Hide from tab bar - now inside Groceries
        }}
      />
      <Tabs.Screen
        name="recipes-new"
        options={{
          title: 'Recipes',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Recipes" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="book"
              size={size}
              color={color}
              style={
                focused
                  ? { transform: [{ scale: 1.1 }] }
                  : {}
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Chat" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="chatbubbles"
              size={size}
              color={color}
              style={
                focused
                  ? { transform: [{ scale: 1.1 }] }
                  : {}
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: 'Learn',
          tabBarLabel: ({ focused }) => <TabLabel focused={focused} label="Learn" />,
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name="school"
              size={size}
              color={color}
              style={
                focused
                  ? { transform: [{ scale: 1.1 }] }
                  : {}
              }
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="upgrade"
        options={{
          href: null, // Hide from tab bar
        }}
      />
      <Tabs.Screen
        name="firebase-test"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
