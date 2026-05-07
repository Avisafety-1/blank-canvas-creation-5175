import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

const SUPABASE_URL = "https://pmucsvrypogtttrajqxq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBtdWNzdnJ5cG9ndHR0cmFqcXhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQyMjcyMDEsImV4cCI6MjA3OTgwMzIwMX0.DMr5OjalAbZKedx0zqcTBWe5eMTrjlXIw384ycvX8dE";

// Actual top-level categories (matching ECCAIRS official tree)
const TOP_LEVEL_IDS = new Set([
  '99010158',  // Operational
  '1000000',   // Equipment
  '3000000',   // Consequential Events
  '99010159',  // Personnel
  '99010164',  // Organisational
  '99012035',  // Any Other Events
  '99000000',  // Unknown
]);

// Explicit parent mappings for structural nodes that don't follow numeric zeroing.
// This mirrors the official ECCAIRS VL390 hierarchy.
const PARENT_MAP: Record<string, string> = {
  // Children of Operational (99010158)
  '2000000': '99010158',   // Aircraft Flight Operations
  '4000000': '99010158',   // Air Navigation Services
  '5000000': '99010158',   // Aerodrome Operations
  '7000000': '99010158',   // Regulatory
  '99010103': '99010158',  // Aircraft Maintenance
  '99012033': '99010158',  // Aircraft Design
  '99012034': '99010158',  // Aircraft Production
  '2240000': '99010158',   // Balloon/Sailplane/RPAS Specific Events
  '2250000': '99010158',   // Balloon specific events

  // Children of Balloon/Sailplane/RPAS Specific Events (2240000)
  '2240100': '2240000',    // Winch launching related event
  '2240200': '2240000',    // Sailplane/Glider Towing
  '2240300': '2240000',    // Glider - Missing Lift
  '99010401': '2240000',   // RPAS/UAS Specific Events

  // Children of Personnel (99010159)
  '99010160': '99010159',  // Experience and Knowledge Events
  '99010161': '99010159',  // Physiological Events
  '99010162': '99010159',  // Situational Awareness and Sensory Events
  '99010163': '99010159',  // Personnel Task Performance Events
};

// RPAS-specific children of 99010401
const RPAS_CHILDREN = new Set([
  '1090000', '1091000',
  '99010402', '99010403', '99010717',
  '99012383', '99012384', '99012385', '99012386',
  '99012634', '99012635',
  '99200004', '99200005', '99200013', '99200014', '99200015', '99200016',
  '99200017', '99200018', '99200019', '99200020', '99200021', '99200022',
  '99200023', '99200025', '99200026',
]);

// Organisational children range: 99010165–99010207
const isOrganisationalChild = (num: number) => num >= 99010165 && num <= 99010207;

interface TreeNode {
  value_id: string;
  label: string;
  children: TreeNode[];
}

interface EccairsEventTypeTreeSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Derive the parent ID for a given VL390 value_id.
 * Uses explicit PARENT_MAP first, then numeric zeroing patterns.
 */
function deriveParent(valueId: string, allIds: Set<string>): string | null {
  if (TOP_LEVEL_IDS.has(valueId)) return null;

  // Explicit mapping takes priority
  if (PARENT_MAP[valueId]) return PARENT_MAP[valueId];

  // RPAS children → 99010401
  if (RPAS_CHILDREN.has(valueId)) return '99010401';

  const num = parseInt(valueId, 10);
  if (isNaN(num)) return null;

  // Organisational children (99010165–99010207) → 99010164
  if (isOrganisationalChild(num)) return '99010164';

  // Numeric ranges (1xxxxxx–7xxxxxx): use zeroing pattern to find parent
  const ranges = [
    [1000000, 2000000],
    [2000000, 3000000],
    [3000000, 4000000],
    [4000000, 5000000],
    [5000000, 6000000],
    [7000000, 8000000],
  ] as const;

  for (const [rangeStart, rangeEnd] of ranges) {
    if (num > rangeStart && num < rangeEnd) {
      const s = valueId.padStart(7, '0');
      for (let zeros = 1; zeros <= 5; zeros++) {
        const parentStr = s.substring(0, 7 - zeros) + '0'.repeat(zeros);
        const parentNum = parseInt(parentStr, 10);
        if (parentNum !== num && parentNum >= rangeStart && allIds.has(parentNum.toString())) {
          return parentNum.toString();
        }
      }
      return rangeStart.toString();
    }
  }

  // 99xxxxxx items without explicit mapping: leave as root-level.
  // They are findable via search. Without ECCAIRS parent_id data,
  // we cannot accurately place them in the hierarchy.
  return null;
}

/** Build ancestor path for a value (for auto-expanding) */
function getAncestors(valueId: string, allIds: Set<string>): string[] {
  const path: string[] = [];
  let current = valueId;
  let safety = 0;
  while (safety++ < 10) {
    const parent = deriveParent(current, allIds);
    if (!parent || !allIds.has(parent)) break;
    path.push(parent);
    current = parent;
  }
  return path;
}

function useVL390Items(enabled: boolean) {
  return useQuery({
    queryKey: ['eccairs-vl390-all'],
    queryFn: async () => {
      const allItems: Array<{ value_id: string; label: string }> = [];
      const batchSize = 1000;
      for (let offset = 0; offset < 5000; offset += batchSize) {
        const url = `${SUPABASE_URL}/rest/v1/value_list_items?value_list_key=eq.VL390&order=value_description&limit=${batchSize}&offset=${offset}&select=value_id,value_description,value_synonym`;
        const res = await fetch(url, {
          headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Accept-Profile': 'eccairs',
          },
        });
        if (!res.ok) throw new Error('Failed to fetch VL390');
        const batch = await res.json();
        if (batch.length === 0) break;
        for (const item of batch) {
          if (item.value_description?.trim()) {
            allItems.push({ value_id: item.value_id, label: item.value_description });
          }
        }
      }
      return allItems;
    },
    staleTime: 1000 * 60 * 10,
    enabled,
  });
}

export function EccairsEventTypeTreeSelect({
  value,
  onChange,
  placeholder = "Velg hendelsestype...",
  disabled = false,
}: EccairsEventTypeTreeSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['99010158', '2240000', '99010401']));

  const { data: items, isLoading } = useVL390Items(open);
  const { data: selectedItem } = useEccairsTaxonomyItem("VL390", value, !!value);

  // Build tree
  const { fullTree, rpasTree } = useMemo(() => {
    if (!items) return { fullTree: [], rpasTree: [] };
    const allIds = new Set(items.map(i => i.value_id));
    const map = new Map<string, TreeNode>();
    for (const item of items) {
      map.set(item.value_id, { value_id: item.value_id, label: item.label, children: [] });
    }

    const roots: TreeNode[] = [];
    for (const item of items) {
      const node = map.get(item.value_id)!;
      const parentId = deriveParent(item.value_id, allIds);
      if (parentId && map.has(parentId)) {
        map.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const sortChildren = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.label.localeCompare(b.label));
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);

    // Build compact RPAS-focused tree:
    // Show only the path: Operational → Balloon/Sailplane/RPAS → RPAS/UAS Specific Events
    const rpasNode = map.get('99010401');
    const balloonNode = map.get('2240000');
    const operationalNode = map.get('99010158');

    const compactTree: TreeNode[] = [];
    if (rpasNode && balloonNode && operationalNode) {
      // Create shallow copies showing only relevant children
      const compactBalloon: TreeNode = {
        ...balloonNode,
        children: balloonNode.children.filter(c => c.value_id === '99010401'),
      };
      const compactOperational: TreeNode = {
        ...operationalNode,
        children: [compactBalloon],
      };
      compactTree.push(compactOperational);
    } else if (rpasNode) {
      compactTree.push(rpasNode);
    }

    return { fullTree: roots, rpasTree: compactTree };
  }, [items]);

  const tree = rpasTree;

  // Filtered tree for search
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const term = search.toLowerCase();
    // When searching, search across ALL items (fullTree), not just RPAS
    const sourceTree = fullTree.length > 0 ? fullTree : tree;
    const filterNodes = (nodes: TreeNode[]): TreeNode[] =>
      nodes.reduce<TreeNode[]>((acc, node) => {
        const childMatches = filterNodes(node.children);
        const selfMatches = node.label.toLowerCase().includes(term) ||
          node.value_id.includes(term);
        if (selfMatches || childMatches.length > 0) {
          acc.push({ ...node, children: selfMatches ? node.children : childMatches });
        }
        return acc;
      }, []);
    return filterNodes(tree);
  }, [tree, search]);

  // Auto-expand when searching
  const searchExpanded = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const ids = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) { ids.add(n.value_id); collect(n.children); }
      }
    };
    collect(filteredTree);
    return ids;
  }, [filteredTree, search]);

  const effectiveExpanded = search.trim() ? searchExpanded : expanded;

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandPathToValue = () => {
    if (!value || !items) return;
    const allIds = new Set(items.map(i => i.value_id));
    const ancestors = getAncestors(value, allIds);
    if (ancestors.length > 0) {
      setExpanded(prev => new Set([...prev, ...ancestors]));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) setTimeout(expandPathToValue, 100);
    if (!isOpen) setSearch("");
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = effectiveExpanded.has(node.value_id);
    const isSelected = value === node.value_id;
    const isTopLevel = TOP_LEVEL_IDS.has(node.value_id);

    return (
      <div key={node.value_id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 px-2 rounded-sm cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
            isSelected && "bg-accent text-accent-foreground font-medium",
            isTopLevel && "font-semibold text-muted-foreground"
          )}
          style={{ paddingLeft: `${depth * 16 + 8}px` }}
          onClick={() => {
            onChange(node.value_id);
            setOpen(false);
            setSearch("");
          }}
        >
          {hasChildren ? (
            <button
              type="button"
              className="p-0.5 rounded hover:bg-muted"
              onClick={(e) => toggleExpand(node.value_id, e)}
            >
              <ChevronRight
                className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")}
              />
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <Check
            className={cn("h-3.5 w-3.5 shrink-0", isSelected ? "opacity-100" : "opacity-0")}
          />
          <span className="truncate">{node.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>{node.children.map(child => renderNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (isLoading && !selectedItem) {
    return <Skeleton className="h-10 w-full" />;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          <span className="truncate">
            {selectedItem?.value_description || (value ? `ID: ${value}` : placeholder)}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <div className="flex items-center border-b px-3" role="search">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Søk hendelsestype..."
            className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <ScrollArea className="h-[300px]">
          <div className="p-1">
            {isLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Laster...</div>
            ) : filteredTree.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Ingen treff</div>
            ) : (
              filteredTree.map(node => renderNode(node, 0))
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
