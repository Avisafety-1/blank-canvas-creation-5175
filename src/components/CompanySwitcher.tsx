import { useState, useMemo } from "react";
import { Building2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

interface SwitcherCompany {
  id: string;
  navn: string;
  isParent?: boolean;
}

interface CompanySwitcherProps {
  companies: SwitcherCompany[];
  currentCompanyId: string | null;
  parentCompanyId?: string | null;
  onSwitch: (companyId: string) => void;
  /** Compact icon-only mode for mobile */
  compact?: boolean;
}

export const CompanySwitcher = ({
  companies,
  currentCompanyId,
  parentCompanyId,
  onSwitch,
  compact = false,
}: CompanySwitcherProps) => {
  const [search, setSearch] = useState("");

  // Separate parent company from children
  const { parent, children } = useMemo(() => {
    const parentCo = companies.find(
      (c) => c.isParent || c.id === parentCompanyId
    );
    const childCos = companies.filter(
      (c) => c.id !== parentCo?.id
    );
    return { parent: parentCo, children: childCos };
  }, [companies, parentCompanyId]);

  // Filter children by search
  const filteredChildren = useMemo(() => {
    if (!search.trim()) return children;
    const q = search.toLowerCase();
    return children.filter((c) => c.navn.toLowerCase().includes(q));
  }, [children, search]);

  const showSearch = children.length > 8;

  if (companies.length === 0) return null;

  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setSearch(""); }}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={compact ? "h-7 w-7 min-w-7 p-0" : "gap-1"}
        >
          <Building2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="bg-card/95 backdrop-blur-md border-glass z-[1150] w-[340px] max-h-[70vh] overflow-hidden flex flex-col"
      >
        {/* Parent company at top */}
        {parent && (
          <>
            <DropdownMenuItem
              onClick={() => onSwitch(parent.id)}
              className={`font-bold text-sm ${
                currentCompanyId === parent.id ? "bg-accent/30" : ""
              }`}
            >
              <Building2 className="w-4 h-4 mr-2 flex-shrink-0" />
              {parent.navn}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Search field */}
        {showSearch && (
          <div className="px-2 py-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Søk avdeling..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-7 pl-7 text-xs"
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {/* Children in 2-column grid */}
        <div className="overflow-y-auto flex-1 px-1 py-1">
          {filteredChildren.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">
              {search ? "Ingen treff" : "Ingen avdelinger"}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-0.5">
              {filteredChildren.map((company) => (
                <DropdownMenuItem
                  key={company.id}
                  onClick={() => onSwitch(company.id)}
                  className={`text-xs rounded-md ${
                    currentCompanyId === company.id
                      ? "bg-accent/30 font-medium"
                      : ""
                  }`}
                >
                  <span className="truncate">{company.navn}</span>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
