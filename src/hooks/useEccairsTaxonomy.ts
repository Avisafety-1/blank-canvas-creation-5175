import { useQuery } from "@tanstack/react-query";

const SUPABASE_URL = "https://pmucsvrypogtttrajqxq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE";

export interface EccairsValueListItem {
  id: number;
  value_list_key: string;
  value_id: string;
  value_synonym: string;
  value_description: string | null;
  extra: Record<string, unknown> | null;
}

// Fetch items with optional search (server-side filtering)
// valueIdPrefix supports two formats:
//   - Simple prefix string (e.g. "1000") — server-side LIKE filter
//   - Numeric range "min-max" (e.g. "1000000-1999999") — client-side numeric filter after broader server fetch
export function useEccairsTaxonomy(valueListKey: string, search: string = "", enabled: boolean = true, valueIdPrefix: string = "") {
  return useQuery({
    queryKey: ['eccairs-taxonomy', valueListKey, search, valueIdPrefix],
    queryFn: async () => {
      // Build query params
      let url = `${SUPABASE_URL}/rest/v1/value_list_items?value_list_key=eq.${encodeURIComponent(valueListKey)}&order=value_description&limit=500`;
      
      // Parse range format "min-max" or plain prefix
      const rangeMatch = valueIdPrefix.match(/^(\d+)-(\d+)$/);
      const serverPrefix = rangeMatch ? valueIdPrefix.substring(0, 4) : valueIdPrefix;
      
      // Add value_id prefix filter if provided (text LIKE for server-side narrowing)
      if (serverPrefix) {
        url += `&value_id=like.${encodeURIComponent(serverPrefix)}*`;
      }
      
      // Add search filter if provided (server-side ILIKE)
      if (search.trim()) {
        const searchTerm = search.trim().toLowerCase();
        url += `&or=(value_description.ilike.*${encodeURIComponent(searchTerm)}*,value_synonym.ilike.*${encodeURIComponent(searchTerm)}*)`;
      }
      
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept-Profile': 'eccairs',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxonomy');
      }
      
      let items = await response.json() as EccairsValueListItem[];
      // Filter out items without description
      items = items.filter(item => item.value_description && item.value_description.trim() !== '');
      
      // Apply client-side numeric range filter if specified
      if (rangeMatch) {
        const min = parseInt(rangeMatch[1], 10);
        const max = parseInt(rangeMatch[2], 10);
        items = items.filter(item => {
          const numId = parseInt(item.value_id, 10);
          return numId >= min && numId <= max;
        });
      }
      
      return items;
    },
    staleTime: 1000 * 60 * 5,
    enabled,
  });
}

// Fetch a single item by value_id (for displaying selected value label)
export function useEccairsTaxonomyItem(valueListKey: string, valueId: string | null, enabled: boolean = true) {
  return useQuery({
    queryKey: ['eccairs-taxonomy-item', valueListKey, valueId],
    queryFn: async () => {
      if (!valueId) return null;
      
      const url = `${SUPABASE_URL}/rest/v1/value_list_items?value_list_key=eq.${encodeURIComponent(valueListKey)}&value_id=eq.${encodeURIComponent(valueId)}&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept-Profile': 'eccairs',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch taxonomy item');
      }
      
      const items = await response.json() as EccairsValueListItem[];
      return items[0] || null;
    },
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (single items rarely change)
    enabled: enabled && !!valueId,
  });
}
