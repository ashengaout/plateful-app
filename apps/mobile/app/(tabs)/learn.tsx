import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Image,
  Alert,
  Modal,
  Linking,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Tutorial, TutorialType, YouTubeTutorial, WrittenTutorial } from '@plateful/shared';
import { colors } from '@plateful/shared';
import { auth } from '../../src/config/firebase';
import Header from '../../src/components/Header';
import { API_BASE } from '../../src/config/api';

type FilterType = 'video' | 'written' | 'either';

export default function LearnScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<FilterType>('either');
  const [viewMode, setViewMode] = useState<'search' | 'saved'>('search');
  const [tutorials, setTutorials] = useState<Tutorial[]>([]);
  const [savedTutorials, setSavedTutorials] = useState<Tutorial[]>([]);
  const [selectedTutorial, setSelectedTutorial] = useState<Tutorial | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingSaved, setLoadingSaved] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savedTutorialIds, setSavedTutorialIds] = useState<Set<string>>(new Set());
  const [writtenContent, setWrittenContent] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (auth.currentUser) {
      loadSavedTutorials();
    }
  }, []);

  useEffect(() => {
    if (viewMode === 'saved' && auth.currentUser) {
      loadSavedTutorialsForView();
    }
  }, [viewMode]);

  const loadSavedTutorials = async () => {
    if (!auth.currentUser) return;

    try {
      const response = await fetch(`${API_BASE}/api/tutorials/${auth.currentUser.uid}`);
      if (response.ok) {
        const data = await response.json();
        const tutorials = data.tutorials || [];
        const savedIds = new Set(tutorials.map((t: Tutorial) => t.id));
        setSavedTutorialIds(savedIds);
        setSavedTutorials(tutorials);
      }
    } catch (error) {
      console.error('Failed to load saved tutorials:', error);
    }
  };

  const loadSavedTutorialsForView = async () => {
    if (!auth.currentUser) return;

    setLoadingSaved(true);
    try {
      const response = await fetch(`${API_BASE}/api/tutorials/${auth.currentUser.uid}`);
      if (response.ok) {
        const data = await response.json();
        const tutorials = data.tutorials || [];
        setSavedTutorials(tutorials);
        const savedIds = new Set(tutorials.map((t: Tutorial) => t.id));
        setSavedTutorialIds(savedIds);
      } else {
        throw new Error('Failed to load saved tutorials');
      }
    } catch (error: any) {
      console.error('Failed to load saved tutorials:', error);
      Alert.alert('Error', 'Failed to load saved tutorials');
    } finally {
      setLoadingSaved(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('Search Required', 'Please enter a search query');
      return;
    }

    setLoading(true);
    try {
      const typeParam = filterType === 'either' ? 'either' : filterType;
      const url = `${API_BASE}/api/tutorials/search?query=${encodeURIComponent(searchQuery)}&type=${typeParam}`;
      console.log('Searching tutorials at:', url);
      
      const response = await fetch(url);

      if (!response.ok) {
        // Try to get error details from response
        let errorDetails = 'Failed to search tutorials';
        try {
          const errorData = await response.json();
          errorDetails = errorData.details || errorData.error || errorDetails;
        } catch {
          errorDetails = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorDetails);
      }

      const data = await response.json();
      
      // Check if API returned an error in the response body
      if (data.error) {
        throw new Error(data.details || data.error || 'Failed to search tutorials');
      }
      
      setTutorials(data.tutorials || []);
    } catch (error: any) {
      console.error('Search error:', error);
      // Extract more detailed error message
      const errorMessage = error.message || 'Failed to search tutorials. Please check if the API server is running.';
      Alert.alert('Search Failed', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const toggleSaveTutorial = async (tutorial: Tutorial) => {
    if (!auth.currentUser) {
      Alert.alert('Sign In Required', 'Please sign in to save tutorials');
      return;
    }

    const isCurrentlySaved = savedTutorialIds.has(tutorial.id);
    const newIsSaved = !isCurrentlySaved;

    try {
      if (newIsSaved) {
        // Save tutorial
        const response = await fetch(`${API_BASE}/api/tutorials/${auth.currentUser.uid}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tutorial }),
        });

        if (!response.ok) {
          // Try to get error details
          let errorMessage = 'Failed to save tutorial';
          try {
            const errorData = await response.json();
            errorMessage = errorData.details || errorData.error || errorMessage;
          } catch {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        setSavedTutorialIds(prev => new Set([...prev, tutorial.id]));
        if (viewMode === 'saved') {
          // Refresh saved tutorials list
          await loadSavedTutorialsForView();
        }
        Alert.alert('Success', 'Tutorial saved!');
      } else {
        // Unsave tutorial
        const response = await fetch(
          `${API_BASE}/api/tutorials/${auth.currentUser.uid}/${tutorial.id}`,
          {
            method: 'DELETE',
          }
        );

        if (!response.ok) {
          // Try to get error details
          let errorMessage = 'Failed to unsave tutorial';
          try {
            const errorData = await response.json();
            errorMessage = errorData.details || errorData.error || errorMessage;
          } catch {
            errorMessage = `Server error: ${response.status} ${response.statusText}`;
          }
          throw new Error(errorMessage);
        }

        setSavedTutorialIds(prev => {
          const newSet = new Set(prev);
          newSet.delete(tutorial.id);
          return newSet;
        });
        if (viewMode === 'saved') {
          // Refresh saved tutorials list
          await loadSavedTutorialsForView();
        }
        Alert.alert('Success', 'Tutorial removed from saved');
      }
    } catch (error: any) {
      console.error('Toggle save error:', error);
      Alert.alert('Error', error.message || 'Failed to update tutorial');
    }
  };

  const loadWrittenContent = async (tutorial: WrittenTutorial) => {
    if (writtenContent[tutorial.id]) {
      return; // Already loaded
    }

    try {
      const url = `${API_BASE}/api/tutorials/scrape?url=${encodeURIComponent(tutorial.url)}`;
      console.log('Loading tutorial content from:', url);
      
      const response = await fetch(url);

      if (!response.ok) {
        // Try to get error details from response
        let errorMessage = 'Failed to load tutorial content';
        try {
          const errorData = await response.json();
          errorMessage = errorData.details || errorData.error || errorMessage;
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Check if API returned an error in the response body
      if (data.error) {
        throw new Error(data.details || data.error || 'Failed to load tutorial content');
      }
      
      if (!data.content) {
        throw new Error('No content found in tutorial');
      }

      setWrittenContent(prev => ({
        ...prev,
        [tutorial.id]: data.content || '',
      }));

      // Update tutorial with scraped metadata
      if (data.imageUrl || data.author || data.siteName) {
        const updatedTutorial: WrittenTutorial = {
          ...tutorial,
          imageUrl: data.imageUrl || tutorial.imageUrl,
          author: data.author || tutorial.author,
          siteName: data.siteName || tutorial.siteName,
          content: data.content,
        };
        setSelectedTutorial(updatedTutorial);
      }
    } catch (error: any) {
      console.error('Failed to load written content:', error);
      const errorMessage = error.message || 'Failed to load tutorial content';
      Alert.alert('Error', errorMessage);
    }
  };

  const handleTutorialPress = async (tutorial: Tutorial) => {
    setSelectedTutorial(tutorial);

    // If written tutorial already has content from search, use it
    if (tutorial.type === 'written' && tutorial.content) {
      setWrittenContent(prev => ({
        ...prev,
        [tutorial.id]: tutorial.content || '',
      }));
    } else if (tutorial.type === 'written') {
      // Only load if content wasn't pre-scraped
      loadWrittenContent(tutorial);
    }
  };

  const openYouTubeVideo = (tutorial: YouTubeTutorial) => {
    Linking.openURL(tutorial.url).catch(err => {
      console.error('Failed to open YouTube:', err);
      Alert.alert('Error', 'Failed to open YouTube');
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    if (viewMode === 'saved') {
      await loadSavedTutorialsForView();
    }
    if (searchQuery.trim()) {
      handleSearch().finally(() => setRefreshing(false));
    } else {
      setRefreshing(false);
    }
  };

  if (selectedTutorial) {
    return (
      <View style={styles.container}>
        <View style={styles.detailHeader}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => setSelectedTutorial(null)}
          >
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.detailTitle} numberOfLines={2}>
            {selectedTutorial.title}
          </Text>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => toggleSaveTutorial(selectedTutorial)}
            >
              <Ionicons
                name={savedTutorialIds.has(selectedTutorial.id) ? 'bookmark' : 'bookmark-outline'}
                size={24}
                color={colors.primary}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView style={styles.detailContent}>
          {selectedTutorial.type === 'video' ? (
            <View style={styles.videoContainer}>
              <Image
                source={{ uri: selectedTutorial.thumbnailUrl }}
                style={styles.videoThumbnail}
                resizeMode="cover"
              />
              <View style={styles.videoInfo}>
                <Text style={styles.channelName}>{selectedTutorial.channelName}</Text>
                <Text style={styles.duration}>{selectedTutorial.duration}</Text>
                {selectedTutorial.viewCount && (
                  <Text style={styles.viewCount}>
                    {selectedTutorial.viewCount.toLocaleString()} views
                  </Text>
                )}
                {selectedTutorial.description && (
                  <Text style={styles.description}>{selectedTutorial.description}</Text>
                )}
              </View>
              <TouchableOpacity
                style={styles.watchButton}
                onPress={() => openYouTubeVideo(selectedTutorial)}
              >
                <Ionicons name="play-circle" size={24} color={colors.surface} />
                <Text style={styles.watchButtonText}>Watch on YouTube</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.writtenContainer}>
              {selectedTutorial.imageUrl ? (
                <View style={styles.writtenImageContainer}>
                  <Image
                    source={{ uri: selectedTutorial.imageUrl }}
                    style={styles.writtenImage}
                    resizeMode="cover"
                  />
                </View>
              ) : (
                <View style={styles.writtenImagePlaceholder}>
                  <Ionicons name="document-text" size={48} color={colors.textSecondary} />
                </View>
              )}
              <View style={styles.writtenMeta}>
                {selectedTutorial.siteName && (
                  <Text style={styles.siteName}>{selectedTutorial.siteName}</Text>
                )}
                {selectedTutorial.author && (
                  <Text style={styles.author}>By {selectedTutorial.author}</Text>
                )}
              </View>
              {writtenContent[selectedTutorial.id] ? (
                <View style={styles.contentContainer}>
                  {(() => {
                    const paragraphs = writtenContent[selectedTutorial.id]
                      .split(/\n\n+/)
                      .filter(para => para.trim().length > 0);
                    
                    const elements: React.ReactElement[] = [];
                    let listItems: string[] = [];
                    
                    paragraphs.forEach((paragraph, index) => {
                      const trimmed = paragraph.trim();
                      
                      // Check if it's a markdown heading (## heading)
                      if (trimmed.startsWith('## ')) {
                        // Flush any pending list items
                        if (listItems.length > 0) {
                          listItems.forEach((item, i) => {
                            elements.push(
                              <View key={`list-${index}-${i}`} style={styles.listItem}>
                                <Text style={styles.bullet}>•</Text>
                                <Text style={styles.listText}>{item.substring(2)}</Text>
                              </View>
                            );
                          });
                          listItems = [];
                        }
                        elements.push(
                          <Text key={index} style={styles.heading}>
                            {trimmed.substring(3)}
                          </Text>
                        );
                        return;
                      }
                      
                      // Check if it's a list item (on single line or multiple lines)
                      const lines = trimmed.split('\n');
                      const allListItems = lines.every(line => line.trim().startsWith('- ') || line.trim().startsWith('* '));
                      
                      if (allListItems && lines.length > 0) {
                        // Add all list items
                        lines.forEach((line, i) => {
                          const listItem = line.trim();
                          if (listItem.startsWith('- ') || listItem.startsWith('* ')) {
                            listItems.push(listItem);
                          }
                        });
                        return;
                      }
                      
                      // Flush any pending list items before non-list content
                      if (listItems.length > 0) {
                        listItems.forEach((item, i) => {
                          elements.push(
                            <View key={`list-${index}-${i}`} style={styles.listItem}>
                              <Text style={styles.bullet}>•</Text>
                              <Text style={styles.listText}>{item.substring(2)}</Text>
                            </View>
                          );
                        });
                        listItems = [];
                      }
                      
                      // Check if it's a heading pattern (short lines that look like headings)
                      const isHeading = /^(What|Why|How|When|Where|Step|Tips?|Note|Warning|Important)/i.test(trimmed) && 
                                       trimmed.length < 100 &&
                                       !trimmed.includes('.') &&
                                       !trimmed.includes(',');
                      
                      if (isHeading && trimmed.length < 80) {
                        elements.push(
                          <Text key={index} style={styles.heading}>
                            {trimmed}
                          </Text>
                        );
                      } else {
                        elements.push(
                          <Text key={index} style={styles.paragraph}>
                            {trimmed}
                          </Text>
                        );
                      }
                    });
                    
                    // Flush any remaining list items
                    if (listItems.length > 0) {
                      listItems.forEach((item, i) => {
                        elements.push(
                          <View key={`list-final-${i}`} style={styles.listItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.listText}>{item.substring(2)}</Text>
                          </View>
                        );
                      });
                    }
                    
                    return elements;
                  })()}
                </View>
              ) : (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.loadingText}>Loading content...</Text>
                </View>
              )}
              <TouchableOpacity
                style={styles.openButton}
                onPress={() => Linking.openURL(selectedTutorial.url)}
              >
                <Ionicons name="open-outline" size={20} color={colors.accent} />
                <Text style={styles.openButtonText}>Open Original Article</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header title="Learn" />
      
      {/* Tab Switcher */}
      <View style={styles.tabSwitcher}>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'search' && styles.tabActive]}
          onPress={() => setViewMode('search')}
        >
          <Ionicons
            name="search"
            size={18}
            color={viewMode === 'search' ? colors.surface : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              viewMode === 'search' && styles.tabTextActive,
            ]}
          >
            Search
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, viewMode === 'saved' && styles.tabActive]}
          onPress={() => setViewMode('saved')}
        >
          <Ionicons
            name="bookmark"
            size={18}
            color={viewMode === 'saved' ? colors.surface : colors.textSecondary}
          />
          <Text
            style={[
              styles.tabText,
              viewMode === 'saved' && styles.tabTextActive,
            ]}
          >
            Saved
          </Text>
        </TouchableOpacity>
      </View>
      <ScrollView
        style={styles.scrollView}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        <View style={styles.contentWrapper}>
          {/* Search Bar - only show in search mode */}
          {viewMode === 'search' && (
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search tutorials (e.g., how to braise, julienne technique)"
                placeholderTextColor={colors.textSecondary}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
                <Ionicons name="search" size={20} color={colors.surface} />
              </TouchableOpacity>
            </View>
          )}


        {/* Filter Buttons - only show in search mode */}
        {viewMode === 'search' && (
          <View style={styles.filterContainer}>
            <TouchableOpacity
              style={[styles.filterButton, filterType === 'video' && styles.filterButtonActive]}
              onPress={() => setFilterType('video')}
            >
              <Ionicons
                name="videocam"
                size={16}
                color={filterType === 'video' ? colors.surface : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterType === 'video' && styles.filterButtonTextActive,
                ]}
              >
                Video
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, filterType === 'written' && styles.filterButtonActive]}
              onPress={() => setFilterType('written')}
            >
              <Ionicons
                name="document-text"
                size={16}
                color={filterType === 'written' ? colors.surface : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterType === 'written' && styles.filterButtonTextActive,
                ]}
              >
                Written
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterButton, filterType === 'either' && styles.filterButtonActive]}
              onPress={() => setFilterType('either')}
            >
              <Ionicons
                name="apps"
                size={16}
                color={filterType === 'either' ? colors.surface : colors.textSecondary}
              />
              <Text
                style={[
                  styles.filterButtonText,
                  filterType === 'either' && styles.filterButtonTextActive,
                ]}
              >
                All
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Results */}
        {viewMode === 'saved' ? (
          // Saved tutorials view
          loadingSaved ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Loading saved tutorials...</Text>
            </View>
          ) : savedTutorials.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="bookmark-outline" size={64} color={colors.textSecondary} />
              <Text style={styles.emptyText}>No saved tutorials</Text>
              <Text style={styles.emptySubtext}>Save tutorials you like to view them here</Text>
            </View>
          ) : (
            <View style={styles.resultsContainer}>
              <Text style={styles.resultsCount}>{savedTutorials.length} saved tutorial(s)</Text>
              {savedTutorials.map((tutorial) => (
                <TouchableOpacity
                  key={tutorial.id}
                  style={styles.tutorialCard}
                  onPress={() => handleTutorialPress(tutorial)}
                >
                  {tutorial.type === 'video' ? (
                    <View style={styles.videoCard}>
                      <Image
                        source={{ uri: tutorial.thumbnailUrl }}
                        style={styles.cardThumbnail}
                        resizeMode="cover"
                      />
                      <View style={styles.cardContent}>
                        <View style={styles.typeLabelContainer}>
                          <View style={styles.typeBadgeVideo}>
                            <Ionicons name="videocam" size={12} color={colors.surface} />
                            <Text style={styles.typeBadgeTextVideo}>Video</Text>
                          </View>
                        </View>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {tutorial.title}
                        </Text>
                        <Text style={styles.cardChannel} numberOfLines={1}>
                          {tutorial.channelName}
                        </Text>
                        <View style={styles.cardMeta}>
                          <Text style={styles.cardMetaText}>{tutorial.duration}</Text>
                          {tutorial.viewCount && (
                            <Text style={styles.cardMetaText}>
                              {tutorial.viewCount.toLocaleString()} views
                            </Text>
                          )}
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.saveButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleSaveTutorial(tutorial);
                        }}
                      >
                        <Ionicons
                          name="bookmark"
                          size={24}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.writtenCard}>
                      {tutorial.imageUrl ? (
                        <Image
                          source={{ uri: tutorial.imageUrl }}
                          style={styles.cardImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.cardImagePlaceholder}>
                          <Ionicons name="document-text" size={24} color={colors.textSecondary} />
                        </View>
                      )}
                      <View style={styles.cardContent}>
                        <View style={styles.typeLabelContainer}>
                          <View style={styles.typeBadgeWritten}>
                            <Ionicons name="document-text" size={12} color={colors.surface} />
                            <Text style={styles.typeBadgeTextWritten}>Article</Text>
                          </View>
                        </View>
                        <Text style={styles.cardTitle} numberOfLines={2}>
                          {tutorial.title}
                        </Text>
                        <Text style={styles.cardDescription} numberOfLines={2}>
                          {tutorial.description}
                        </Text>
                        {tutorial.siteName && (
                          <Text style={styles.cardSiteName} numberOfLines={1} ellipsizeMode="tail">
                            {tutorial.siteName}
                          </Text>
                        )}
                      </View>
                      <TouchableOpacity
                        style={styles.saveButton}
                        onPress={(e) => {
                          e.stopPropagation();
                          toggleSaveTutorial(tutorial);
                        }}
                      >
                        <Ionicons
                          name="bookmark"
                          size={24}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )
        ) : loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>Searching tutorials...</Text>
          </View>
        ) : tutorials.length === 0 && searchQuery.trim() ? (
          <View style={styles.emptyState}>
            <Ionicons name="school-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>No tutorials found</Text>
            <Text style={styles.emptySubtext}>Try a different search query</Text>
          </View>
        ) : tutorials.length > 0 ? (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsCount}>{tutorials.length} tutorial(s) found</Text>
            {tutorials.map((tutorial) => (
              <TouchableOpacity
                key={tutorial.id}
                style={styles.tutorialCard}
                onPress={() => handleTutorialPress(tutorial)}
              >
                {tutorial.type === 'video' ? (
                  <View style={styles.videoCard}>
                    <Image
                      source={{ uri: tutorial.thumbnailUrl }}
                      style={styles.cardThumbnail}
                      resizeMode="cover"
                    />
                    <View style={styles.cardContent}>
                      <View style={styles.typeLabelContainer}>
                        <View style={styles.typeBadgeVideo}>
                          <Ionicons name="videocam" size={12} color={colors.surface} />
                          <Text style={styles.typeBadgeTextVideo}>Video</Text>
                        </View>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {tutorial.title}
                      </Text>
                      <Text style={styles.cardChannel} numberOfLines={1}>
                        {tutorial.channelName}
                      </Text>
                      <View style={styles.cardMeta}>
                        <Text style={styles.cardMetaText}>{tutorial.duration}</Text>
                        {tutorial.viewCount && (
                          <Text style={styles.cardMetaText}>
                            {tutorial.viewCount.toLocaleString()} views
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleSaveTutorial(tutorial);
                      }}
                    >
                      <Ionicons
                        name={savedTutorialIds.has(tutorial.id) ? 'bookmark' : 'bookmark-outline'}
                        size={24}
                        color={savedTutorialIds.has(tutorial.id) ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={styles.writtenCard}>
                    {tutorial.imageUrl ? (
                      <Image
                        source={{ uri: tutorial.imageUrl }}
                        style={styles.cardImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cardImagePlaceholder}>
                        <Ionicons name="document-text" size={24} color={colors.textSecondary} />
                      </View>
                    )}
                    <View style={styles.cardContent}>
                      <View style={styles.typeLabelContainer}>
                        <View style={styles.typeBadgeWritten}>
                          <Ionicons name="document-text" size={12} color={colors.surface} />
                          <Text style={styles.typeBadgeTextWritten}>Article</Text>
                        </View>
                      </View>
                      <Text style={styles.cardTitle} numberOfLines={2}>
                        {tutorial.title}
                      </Text>
                      {tutorial.description && (
                        <Text style={styles.cardDescription} numberOfLines={2}>
                          {tutorial.description}
                        </Text>
                      )}
                      <View style={styles.cardMeta}>
                        {tutorial.siteName && (
                          <Text style={styles.cardMetaText} numberOfLines={1} ellipsizeMode="tail">
                            {tutorial.siteName}
                          </Text>
                        )}
                        {tutorial.author && (
                          <Text style={styles.cardMetaText} numberOfLines={1} ellipsizeMode="tail">
                            {tutorial.siteName ? ' • ' : ''}{tutorial.author}
                          </Text>
                        )}
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.saveButton}
                      onPress={(e) => {
                        e.stopPropagation();
                        toggleSaveTutorial(tutorial);
                      }}
                    >
                      <Ionicons
                        name={savedTutorialIds.has(tutorial.id) ? 'bookmark' : 'bookmark-outline'}
                        size={24}
                        color={savedTutorialIds.has(tutorial.id) ? colors.primary : colors.textSecondary}
                      />
                    </TouchableOpacity>
                  </View>
                )}
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="school-outline" size={64} color={colors.textSecondary} />
            <Text style={styles.emptyText}>Search for tutorials</Text>
            <Text style={styles.emptySubtext}>
              Learn cooking techniques like braising, julienne, and more
            </Text>
          </View>
        )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
  },
  contentWrapper: {
    paddingLeft: 20,
    paddingRight: 20,
    paddingTop: 20,
    paddingBottom: 0,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 25,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchButton: {
    backgroundColor: colors.primary,
    borderRadius: 25,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabSwitcher: {
    flexDirection: 'row',
    marginHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
    backgroundColor: colors.background,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: colors.primary,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.surface,
  },
  filterContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  filterButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 20,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterButtonTextActive: {
    color: colors.surface,
  },
  resultsContainer: {
    gap: 16,
  },
  resultsCount: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
  },
  tutorialCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  videoCard: {
    flexDirection: 'row',
    gap: 12,
  },
  writtenCard: {
    flexDirection: 'row',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  cardThumbnail: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  cardImage: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.background,
  },
  cardImagePlaceholder: {
    width: 120,
    height: 90,
    borderRadius: 8,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabelContainer: {
    marginBottom: 6,
  },
  typeBadgeVideo: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FF0000', // YouTube red
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeTextVideo: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.surface,
    letterSpacing: 0.3,
  },
  typeBadgeWritten: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  typeBadgeTextWritten: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.surface,
    letterSpacing: 0.3,
  },
  cardContent: {
    flex: 1,
    gap: 4,
    minWidth: 0, // Allows flex children to shrink below their content size
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  cardChannel: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  cardDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  cardMeta: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 4,
    flexShrink: 1,
  },
  cardMetaText: {
    fontSize: 12,
    color: colors.textSecondary,
    flexShrink: 1,
  },
  cardSiteName: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 4,
  },
  saveButton: {
    padding: 4,
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: colors.textSecondary,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.textSecondary,
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
  },
  backButton: {
    padding: 4,
    marginRight: 12,
  },
  detailTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerButton: {
    padding: 4,
  },
  detailContent: {
    flex: 1,
    padding: 20,
  },
  videoContainer: {
    gap: 16,
  },
  videoThumbnail: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  videoInfo: {
    gap: 8,
  },
  channelName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  duration: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  viewCount: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  description: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textPrimary,
    marginTop: 8,
  },
  watchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  watchButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.surface,
  },
  writtenContainer: {
    gap: 16,
  },
  writtenImageContainer: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 20,
    position: 'relative',
    overflow: 'hidden',
  },
  writtenImage: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    backgroundColor: colors.background,
  },
  writtenImagePlaceholder: {
    width: '100%',
    height: 250,
    borderRadius: 12,
    marginBottom: 20,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  writtenMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  siteName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  author: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  contentContainer: {
    // No gap property - using marginBottom on paragraphs instead
  },
  paragraph: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textPrimary,
    marginBottom: 16,
  },
  heading: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    marginTop: 16,
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  bullet: {
    fontSize: 15,
    color: colors.textPrimary,
    marginRight: 8,
  },
  listText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  content: {
    fontSize: 15,
    lineHeight: 24,
    color: colors.textPrimary,
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 40,
  },
  openButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 8,
  },
  openButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.accent,
  },
});

