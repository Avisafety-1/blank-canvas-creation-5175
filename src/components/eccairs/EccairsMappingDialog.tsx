import { useState, useEffect } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { EccairsTaxonomySelect } from "./EccairsTaxonomySelect";
import { EccairsMultiSelect } from "./EccairsMultiSelect";
import { EccairsPhaseOfFlightSelect } from "./EccairsPhaseOfFlightSelect";
import { EccairsEventTypeTreeSelect } from "./EccairsEventTypeTreeSelect";

import { useIncidentEccairsAttributes, AttributeData } from "@/hooks/useIncidentEccairsAttributes";
import { 
  ECCAIRS_FIELDS, 
  EccairsFieldConfig, 
  EccairsFieldGroup,
  ECCAIRS_FIELD_GROUP_LABELS,
  ECCAIRS_FIELD_GROUP_ICONS,
  COLLAPSIBLE_GROUPS,
  getOrderedGroups,
  getFieldsByGroup
} from "@/config/eccairsFields";
import { suggestEccairsMapping, OCCURRENCE_CLASS_LABELS } from "@/lib/eccairsAutoMapping";
import { Loader2, Sparkles, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { usePlanGating } from "@/hooks/usePlanGating";
import { supabase } from "@/integrations/supabase/client";

interface IncidentComment {
  id: string;
  comment_text: string;
  created_by_name: string;
  created_at: string;
}

interface Incident {
  id: string;
  tittel: string;
  beskrivelse: string | null;
  alvorlighetsgrad: string;
  lokasjon: string | null;
  kategori: string | null;
  company_id: string;
  hendelsestidspunkt?: string;
  incident_number?: string | null;
  mission_id?: string | null;
  drone_serial_number?: string | null;
  hovedaarsak?: string | null;
  medvirkende_aarsak?: string | null;
  comments?: IncidentComment[];
}

interface EccairsMappingDialogProps {
  incident: Incident;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function EccairsMappingDialog({
  incident,
  open,
  onOpenChange,
  onSaved,
}: EccairsMappingDialogProps) {
  const { hasAddon } = usePlanGating();
  const { attributes, getAttribute, isLoading, saveAllAttributes, isSaving } = 
    useIncidentEccairsAttributes(incident.id, open);

  useEffect(() => {
    if (open && !hasAddon('eccairs')) {
      toast.error('ECCAIRS-rapportering krever ECCAIRS-tilleggsmodulen');
      onOpenChange(false);
    }
  }, [open]);
  
  // Generic state: Record<`${code}_${taxonomyCode}_${entityPath}`, value>
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [additionalTextValues, setAdditionalTextValues] = useState<Record<string, string>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(getOrderedGroups().filter(g => g !== 'identification'))
  );
  const makeFieldKey = (field: EccairsFieldConfig) => 
    `${field.code}_${field.taxonomyCode}_${field.entityPath ?? 'top'}`;

  const setFieldValue = (field: EccairsFieldConfig, value: string | null) => {
    const key = makeFieldKey(field);
    setFieldValues(prev => ({ ...prev, [key]: value ?? '' }));
  };

  const getFieldValue = (field: EccairsFieldConfig): string => {
    const key = makeFieldKey(field);
    return fieldValues[key] ?? field.defaultValue ?? '';
  };

  // Parse multi-select value from JSON string to array
  const parseMultiSelectValue = (value: string): string[] | null => {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      // If not valid JSON, treat as single value
      return value ? [value] : null;
    }
  };

  const ECCAIRS_SERIAL_FALLBACK = '99999999999';
  const normalizeEccairsSerialNumber = (value: string | null | undefined) => {
    const digits = (value ?? '').replace(/\D/g, '').slice(0, 11);
    return digits || ECCAIRS_SERIAL_FALLBACK;
  };

  // Get occurrence class for display (code 431)
  const occurrenceClassValue = getFieldValue(ECCAIRS_FIELDS.find(f => f.code === 431)!);

  // Reset local state when opening/changing incident to avoid stale values
  useEffect(() => {
    if (!open) return;
    setFieldValues({});
    setAdditionalTextValues({});
  }, [open, incident.id]);

  // Load existing attributes or apply auto-suggestions
  useEffect(() => {
    if (!open) return;

    const hasExistingData = Object.keys(attributes).length > 0;
    
    if (hasExistingData) {
      // Load from database, then merge in defaults for missing fields
      const newValues: Record<string, string> = {};
      
      // First, apply defaults for all fields
      ECCAIRS_FIELDS.forEach(field => {
        if (field.defaultValue) {
          newValues[makeFieldKey(field)] = field.defaultValue;
        }
      });
      
      // Then override with saved values
      ECCAIRS_FIELDS.forEach(field => {
        const attr = getAttribute(field.code, field.taxonomyCode, field.entityPath ?? null);
        if (attr) {
          if (field.type === 'code_and_text') {
            // For code_and_text: value_id has the code, text_value has the additional text
            if (attr.value_id) {
              newValues[makeFieldKey(field)] = attr.value_id;
            }
            if (attr.text_value) {
              setAdditionalTextValues(prev => ({ ...prev, [makeFieldKey(field)]: attr.text_value! }));
            }
          } else {
            const value = field.type === 'select' ? attr.value_id : attr.text_value;
            if (value) {
              newValues[makeFieldKey(field)] = field.code === 244
                ? normalizeEccairsSerialNumber(value)
                : value;
            }
          }
        }
      });
      setFieldValues(newValues);
    } else if (!isLoading) {
      // Apply auto-suggestions for new mappings
      applyAutoSuggestions();
    }
  }, [attributes, isLoading, open, incident]);

  const applyAutoSuggestions = async () => {
    const suggestions = suggestEccairsMapping(incident);

    // Fetch company name for field 447 (Reporting Entity) additional text
    let companyName = '';
    try {
      const { data } = await supabase
        .from('companies')
        .select('navn')
        .eq('id', incident.company_id)
        .single();
      if (data?.navn) companyName = data.navn;
    } catch { /* ignore */ }

    const newValues: Record<string, string> = {};
    
    // Map suggestions to field values
    ECCAIRS_FIELDS.forEach(field => {
      if (field.code === 433 && suggestions.occurrence_date) {
        newValues[makeFieldKey(field)] = suggestions.occurrence_date;
      } else if (field.code === 457 && incident.hendelsestidspunkt) {
        // Auto-fill local time from hendelsestidspunkt
        try {
          const time = new Date(incident.hendelsestidspunkt).toLocaleTimeString('no-NO', { 
            hour: '2-digit', 
            minute: '2-digit',
            hour12: false 
          });
          newValues[makeFieldKey(field)] = time;
        } catch {
          // Ignore parse errors
        }
      } else if (field.code === 601 && incident.tittel) {
        // Auto-fill headline from incident title
        newValues[makeFieldKey(field)] = incident.tittel;
      } else if (field.code === 440 && incident.lokasjon) {
        // Auto-fill location name from lokasjon
        newValues[makeFieldKey(field)] = incident.lokasjon;
      } else if (field.code === 431 && suggestions.occurrence_class) {
        newValues[makeFieldKey(field)] = suggestions.occurrence_class;
      } else if (field.code === 390 && suggestions.event_type) {
        // Auto-fill event type based on hovedårsak/medvirkende årsak/kategori
        newValues[makeFieldKey(field)] = suggestions.event_type;
      } else if (field.code === 32 && suggestions.aircraft_category) {
        newValues[makeFieldKey(field)] = suggestions.aircraft_category;
      } else if (field.code === 454 && suggestions.state_area) {
        // Auto-fill state/area based on postcode from lokasjon
        // Store as JSON array string for content_object_array format
        newValues[makeFieldKey(field)] = JSON.stringify(suggestions.state_area);
      } else if (field.code === 438 && incident.incident_number) {
        // Auto-fill file number from incident_number
        newValues[makeFieldKey(field)] = incident.incident_number;
      } else if (field.code === 424) {
        // Default narrative language to Norwegian (43)
        newValues[makeFieldKey(field)] = '43';
      } else if (field.code === 425) {
        // Auto-fill narrative text from incident description + comments
        let narrativeText = incident.beskrivelse || '';
        
        // Append comments if available
        if (incident.comments && incident.comments.length > 0) {
          const commentsText = incident.comments
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            .map(c => {
              const date = new Date(c.created_at).toLocaleDateString('no-NO', { 
                day: '2-digit', 
                month: '2-digit', 
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });
              return `[${date} - ${c.created_by_name}]: ${c.comment_text}`;
            })
            .join('\n');
          
          if (narrativeText) {
            narrativeText += '\n\n--- Kommentarer ---\n' + commentsText;
          } else {
            narrativeText = commentsText;
          }
        }
        
        if (narrativeText) {
          newValues[makeFieldKey(field)] = narrativeText;
        }
      } else if (field.code === 244) {
        // Auto-fill aircraft serial number from drone
        newValues[makeFieldKey(field)] = normalizeEccairsSerialNumber(incident.drone_serial_number);
      } else if (field.defaultValue) {
        newValues[makeFieldKey(field)] = field.defaultValue;
      }

      // Auto-fill additional text for code_and_text fields with company name
      if (companyName && field.type === 'code_and_text' && (field.code === 447 || field.code === 215)) {
        setAdditionalTextValues(prev => ({ ...prev, [makeFieldKey(field)]: companyName }));
      }
    });
    
    setFieldValues(newValues);
  };

  const handleApplySuggestions = () => {
    applyAutoSuggestions();
    toast.success("Forslag anvendt");
  };

  const handleSave = async () => {
    try {
      // First, derive hidden fields from their source fields
      const derivedValues = { ...fieldValues };
      ECCAIRS_FIELDS.filter(f => f.type === 'hidden' && f.deriveFrom).forEach(field => {
        const sourceField = ECCAIRS_FIELDS.find(f => f.code === field.deriveFrom);
        if (sourceField) {
          const sourceValue = derivedValues[makeFieldKey(sourceField)] ?? sourceField.defaultValue ?? '';
          if (sourceValue) {
            derivedValues[makeFieldKey(field)] = sourceValue;
          }
        }
      });

      const attributesToSave: Array<{ code: number; data: AttributeData }> = [];
      
      ECCAIRS_FIELDS.forEach(field => {
        const rawValue = derivedValues[makeFieldKey(field)] ?? field.defaultValue ?? '';
        const value = field.code === 244 ? normalizeEccairsSerialNumber(rawValue) : rawValue;
        if (!value) return;
        
        attributesToSave.push({
          code: field.code,
          data: {
            taxonomy_code: field.taxonomyCode,
            entity_path: field.entityPath ?? null,
            format: field.format,
            value_id: (field.type === 'select' || field.type === 'code_and_text') ? value : null,
            text_value: field.type === 'code_and_text' 
              ? (additionalTextValues[makeFieldKey(field)] || null)
              : (field.type !== 'select' ? value : null),
          }
        });
      });

      await saveAllAttributes(attributesToSave);
      toast.success("Klassifisering lagret");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to save mapping:", error);
      toast.error("Kunne ikke lagre klassifisering");
    }
  };

  // Check if required fields are filled
  const requiredFieldsFilled = ECCAIRS_FIELDS
    .filter(f => f.required)
    .every(f => !!getFieldValue(f));

  // Helper to get the VL key for a field
  const getVLKey = (field: EccairsFieldConfig): string => {
    return `VL${field.code}`;
  };

  // Render a single field based on its type
  const renderField = (field: EccairsFieldConfig) => {
    if (field.type === 'hidden') return null;

    const isMultiSelect = field.format === 'content_object_array';
    const fieldKey = makeFieldKey(field);

    if (field.type === 'code_and_text') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label} ({getVLKey(field)})
            {field.entityPath && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Entity {field.entityPath}
              </Badge>
            )}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <EccairsTaxonomySelect
            valueListKey={getVLKey(field)}
            value={getFieldValue(field) || null}
            onChange={(val) => setFieldValue(field, val)}
            placeholder={`Velg ${field.label.toLowerCase()}...`}
            valueIdPrefix={field.valueIdPrefix}
            fixedLabel={field.fixedLabel}
          />
          {field.additionalTextField && (
            <div className="mt-2">
              <Label className="text-xs">{field.additionalTextField}</Label>
              <Input
                value={additionalTextValues[fieldKey] ?? ''}
                onChange={(e) => setAdditionalTextValues(prev => ({ ...prev, [fieldKey]: e.target.value }))}
                placeholder={`Skriv ${field.additionalTextField.toLowerCase()}...`}
                className="mt-1"
              />
            </div>
          )}
        </div>
      );
    }

    if (field.type === 'select') {
      const isMultiSelect = field.format === 'content_object_array';
      
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label} ({getVLKey(field)})
            {field.entityPath && (
              <Badge variant="secondary" className="ml-2 text-xs">
                Entity {field.entityPath}
              </Badge>
            )}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          {field.code === 390 ? (
            <EccairsEventTypeTreeSelect
              value={getFieldValue(field) || null}
              onChange={(val) => setFieldValue(field, val)}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
            />
          ) : field.code === 391 ? (
            <EccairsPhaseOfFlightSelect
              value={getFieldValue(field) || null}
              onChange={(val) => setFieldValue(field, val)}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
            />
          ) : isMultiSelect ? (
            <EccairsMultiSelect
              valueListKey={getVLKey(field)}
              value={parseMultiSelectValue(getFieldValue(field))}
              onChange={(vals) => setFieldValue(field, JSON.stringify(vals))}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
              maxItems={field.maxValues || 5}
            />
          ) : (
            <EccairsTaxonomySelect
              valueListKey={getVLKey(field)}
              value={getFieldValue(field) || null}
              onChange={(val) => setFieldValue(field, val)}
              placeholder={`Velg ${field.label.toLowerCase()}...`}
              valueIdPrefix={field.valueIdPrefix}
              fixedLabel={field.fixedLabel}
            />
          )}
        </div>
      );
    }

    if (field.type === 'date') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Input
            type="date"
            value={getFieldValue(field)}
            onChange={(e) => setFieldValue(field, e.target.value || null)}
            className="max-w-xs"
          />
        </div>
      );
    }

    if (field.type === 'time') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Input
            type="time"
            value={getFieldValue(field)}
            onChange={(e) => setFieldValue(field, e.target.value || null)}
            className="max-w-xs"
          />
        </div>
      );
    }

    if (field.type === 'text') {
      return (
        <div key={fieldKey} className="space-y-2">
          <Label>
            {field.label}
            {field.maxLength && (
              <span className="text-muted-foreground ml-2 text-xs">
                {getFieldValue(field).length}/{field.maxLength}
              </span>
            )}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Input
            value={getFieldValue(field)}
            onChange={(e) => {
              const nextValue = field.code === 244
                ? e.target.value.replace(/\D/g, '').slice(0, field.maxLength ?? 11)
                : field.maxLength 
                  ? e.target.value.slice(0, field.maxLength) 
                  : e.target.value;
              setFieldValue(field, nextValue);
            }}
            inputMode={field.code === 244 ? 'numeric' : undefined}
            pattern={field.code === 244 ? '[0-9]*' : undefined}
            placeholder={`Skriv ${field.label.toLowerCase()}...`}
          />
        </div>
      );
    }

    if (field.type === 'textarea') {
      return (
        <div key={fieldKey} className="space-y-2 col-span-full">
          <Label>
            {field.label}
            {field.required && <span className="text-destructive ml-1">*</span>}
          </Label>
          {field.helpText && (
            <p className="text-xs text-muted-foreground">{field.helpText}</p>
          )}
          <Textarea
            value={getFieldValue(field)}
            onChange={(e) => setFieldValue(field, e.target.value)}
            placeholder={`Skriv ${field.label.toLowerCase()}...`}
            rows={4}
          />
        </div>
      );
    }

    return null;
  };

  // Render a group of fields

  const toggleCollapsed = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const renderGroup = (group: EccairsFieldGroup) => {
    const fields = getFieldsByGroup(group).filter(f => f.type !== 'hidden');
    if (fields.length === 0) return null;

    const icon = ECCAIRS_FIELD_GROUP_ICONS[group];
    const label = ECCAIRS_FIELD_GROUP_LABELS[group];
    const isOpen = !collapsedGroups.has(group);

    return (
      <Collapsible key={group} open={isOpen} onOpenChange={() => toggleCollapsed(group)}>
        <CollapsibleTrigger className="flex items-center gap-2 w-full text-left font-medium text-sm text-muted-foreground border-b pb-2 hover:text-foreground transition-colors cursor-pointer">
          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span>{icon} {label}</span>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            {fields.map(field => renderField(field))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>ECCAIRS Klassifisering</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* AviSafe data summary */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground">AviSafe-data</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Tittel: </span>
                  <span className="font-medium">{incident.tittel}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Alvorlighet: </span>
                  <Badge variant="outline">{incident.alvorlighetsgrad}</Badge>
                  {occurrenceClassValue && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      → {OCCURRENCE_CLASS_LABELS[occurrenceClassValue] || occurrenceClassValue}
                    </span>
                  )}
                </div>
                {incident.kategori && (
                  <div>
                    <span className="text-muted-foreground">Kategori: </span>
                    <span>{incident.kategori}</span>
                  </div>
                )}
                {incident.lokasjon && (
                  <div>
                    <span className="text-muted-foreground">Lokasjon: </span>
                    <span>{incident.lokasjon}</span>
                  </div>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleApplySuggestions}
                className="mt-2"
              >
                <Sparkles className="w-4 h-4 mr-2" />
                Bruk automatiske forslag
              </Button>
            </div>

            {/* ECCAIRS classification fields - grouped logically */}
            <div className="space-y-6">
              {getOrderedGroups().map(group => renderGroup(group))}
            </div>

            {!requiredFieldsFilled && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4" />
                <span>Hendelsesklasse og Overskrift er påkrevd for ECCAIRS-eksport</span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !requiredFieldsFilled}>
            {isSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Lagre klassifisering
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
