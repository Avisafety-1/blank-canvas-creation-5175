import { useState, useMemo } from "react";
import { useEccairsTaxonomy, useEccairsTaxonomyItem } from "@/hooks/useEccairsTaxonomy";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronRight, ChevronsUpDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";

// Parent mapping for RPAS/UAS phase of flight (VL391 1000000-series)
const PARENT_MAP: Record<string, string> = {
  // Level 2 → root 1000000
  '1000001': '1000000', '1000020': '1000000', '1000040': '1000000',
  '1000057': '1000000', '1000058': '1000000', '1000071': '1000000',
  '1000072': '1000000', '1000073': '1000000', '1000074': '1000000',
  '1000075': '1000000', '1000076': '1000000', '1000090': '1000000',
  '1000107': '1000000', '1000114': '1000000', '1000127': '1000000',
  '1000128': '1000000',
  // Level 3 → Approach (1000001)
  '1000002': '1000001', '1000007': '1000001', '1000008': '1000001',
  '1000009': '1000001', '1000010': '1000001', '1000011': '1000001',
  '1000012': '1000001', '1000013': '1000001', '1000014': '1000001',
  '1000015': '1000001', '1000016': '1000001', '1000017': '1000001',
  '1000018': '1000001', '1000019': '1000001',
  // Level 3 → En-route (1000020)
  '1000021': '1000020', '1000022': '1000020', '1000023': '1000020',
  '1000024': '1000020', '1000025': '1000020', '1000026': '1000020',
  '1000027': '1000020', '1000029': '1000020', '1000032': '1000020',
  '1000033': '1000020', '1000035': '1000020', '1000036': '1000020',
  '1000038': '1000020',
  // Level 3 → Landing (1000040)
  '1000041': '1000040', '1000043': '1000040', '1000044': '1000040',
  '1000045': '1000040', '1000046': '1000040', '1000047': '1000040',
  '1000050': '1000040', '1000051': '1000040', '1000052': '1000040',
  '1000054': '1000040', '1000055': '1000040', '1000056': '1000040',
  // Level 3 → Manoeuvring (1000058)
  '1000059': '1000058', '1000060': '1000058', '1000063': '1000058',
  '1000064': '1000058', '1000067': '1000058', '1000068': '1000058',
  '1000069': '1000058', '1000070': '1000058',
  // Level 3 → Standing (1000076)
  '1000077': '1000076', '1000078': '1000076', '1000079': '1000076',
  '1000080': '1000076', '1000081': '1000076', '1000082': '1000076',
  '1000083': '1000076', '1000084': '1000076', '1000085': '1000076',
  '1000086': '1000076', '1000087': '1000076', '1000088': '1000076',
  // Level 3 → Take-off (1000090)
  '1000091': '1000090', '1000092': '1000090', '1000093': '1000090',
  '1000094': '1000090', '1000095': '1000090', '1000096': '1000090',
  '1000097': '1000090', '1000099': '1000090', '1000100': '1000090',
  '1000101': '1000090', '1000102': '1000090', '1000103': '1000090',
  '1000104': '1000090', '1000105': '1000090', '1000106': '1000090',
  // Level 3 → Taxi (1000114)
  '1000115': '1000114', '1000116': '1000114', '1000117': '1000114',
  '1000118': '1000114', '1000119': '1000114', '1000124': '1000114',
  '1000125': '1000114', '1000126': '1000114',
  // Level 4 → Circuit pattern (1000002)
  '1000003': '1000002', '1000004': '1000002', '1000005': '1000002',
  '1000006': '1000002',
  // Level 4 → Landing roll (1000047)
  '1000048': '1000047', '1000049': '1000047',
  // Level 4 → Autorotative descent (1000060)
  '1000061': '1000060', '1000062': '1000060',
  // Level 4 → Hovering (1000064)
  '1000065': '1000064', '1000066': '1000064',
  // Level 4 → Pushback (1000119)
  '1000120': '1000119', '1000121': '1000119', '1000122': '1000119',
  '1000123': '1000119',
};

interface TreeNode {
  value_id: string;
  label: string;
  children: TreeNode[];
}

interface EccairsPhaseOfFlightSelectProps {
  value: string | null;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function EccairsPhaseOfFlightSelect({
  value,
  onChange,
  placeholder = "Velg flytefase...",
  disabled = false,
}: EccairsPhaseOfFlightSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data: items, isLoading } = useEccairsTaxonomy(
    "VL391", "", open, "1000000-1999999"
  );

  const { data: selectedItem } = useEccairsTaxonomyItem("VL391", value, !!value);

  // Build tree from flat list
  const tree = useMemo(() => {
    if (!items) return [];
    const map = new Map<string, TreeNode>();
    for (const item of items) {
      map.set(item.value_id, {
        value_id: item.value_id,
        label: item.value_description || item.value_synonym,
        children: [],
      });
    }
    const roots: TreeNode[] = [];
    for (const item of items) {
      const node = map.get(item.value_id)!;
      const parentId = PARENT_MAP[item.value_id];
      if (parentId && map.has(parentId)) {
        map.get(parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    // Sort children alphabetically
    const sortChildren = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => a.label.localeCompare(b.label));
      nodes.forEach(n => sortChildren(n.children));
    };
    sortChildren(roots);
    return roots;
  }, [items]);

  // Filtered tree for search
  const filteredTree = useMemo(() => {
    if (!search.trim()) return tree;
    const term = search.toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const childMatches = filterNodes(node.children);
        const selfMatches = node.label.toLowerCase().includes(term);
        if (selfMatches || childMatches.length > 0) {
          acc.push({ ...node, children: selfMatches ? node.children : childMatches });
        }
        return acc;
      }, []);
    };
    return filterNodes(tree);
  }, [tree, search]);

  // Auto-expand parents when searching
  const searchExpanded = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    const ids = new Set<string>();
    const collect = (nodes: TreeNode[]) => {
      for (const n of nodes) {
        if (n.children.length > 0) {
          ids.add(n.value_id);
          collect(n.children);
        }
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

  // Auto-expand path to selected value on open
  const expandPathToValue = () => {
    if (!value) return;
    const path = new Set<string>();
    let current = value;
    while (PARENT_MAP[current]) {
      path.add(PARENT_MAP[current]);
      current = PARENT_MAP[current];
    }
    if (path.size > 0) {
      setExpanded(prev => new Set([...prev, ...path]));
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) expandPathToValue();
    if (!isOpen) setSearch("");
  };

  const renderNode = (node: TreeNode, depth: number): React.ReactNode => {
    const hasChildren = node.children.length > 0;
    const isExpanded = effectiveExpanded.has(node.value_id);
    const isSelected = value === node.value_id;
    const isRoot = node.value_id === '1000000';

    return (
      <div key={node.value_id}>
        <div
          className={cn(
            "flex items-center gap-1 py-1.5 px-2 rounded-sm cursor-pointer text-sm hover:bg-accent hover:text-accent-foreground transition-colors",
            isSelected && "bg-accent text-accent-foreground font-medium",
            isRoot && "font-semibold text-muted-foreground"
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
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  isExpanded && "rotate-90"
                )}
              />
            </button>
          ) : (
            <span className="w-4.5" />
          )}
          <Check
            className={cn(
              "h-3.5 w-3.5 shrink-0",
              isSelected ? "opacity-100" : "opacity-0"
            )}
          />
          <span className="truncate">{node.label}</span>
        </div>
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderNode(child, depth + 1))}
          </div>
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
            placeholder="Søk flytefase..."
            className="h-11 border-0 bg-transparent px-0 focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>
        <ScrollArea className="max-h-[300px]">
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
