import { useState, useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { SearchablePersonSelect } from "@/components/SearchablePersonSelect";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Customer {
  id: string;
  navn: string;
  kontaktperson: string | null;
  epost: string | null;
  telefon: string | null;
  adresse: string | null;
  merknader: string | null;
  aktiv: boolean;
  intern_poc_id?: string | null;
}

interface CustomerManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: Customer | null;
  onSuccess: () => void;
}

const customerSchema = z.object({
  navn: z.string()
    .trim()
    .min(1, "Kundenavn er påkrevd")
    .max(200, "Kundenavn må være under 200 tegn"),
  kontaktperson: z.string()
    .trim()
    .max(200, "Kontaktperson må være under 200 tegn")
    .optional()
    .or(z.literal("")),
  epost: z.string()
    .trim()
    .email("Ugyldig e-postadresse")
    .max(255, "E-post må være under 255 tegn")
    .optional()
    .or(z.literal("")),
  telefon: z.string()
    .trim()
    .max(20, "Telefonnummer må være under 20 tegn")
    .optional()
    .or(z.literal("")),
  adresse: z.string()
    .trim()
    .max(500, "Adresse må være under 500 tegn")
    .optional()
    .or(z.literal("")),
  merknader: z.string()
    .trim()
    .max(1000, "Merknader må være under 1000 tegn")
    .optional()
    .or(z.literal("")),
});

type CustomerFormData = z.infer<typeof customerSchema>;

export const CustomerManagementDialog = ({
  open,
  onOpenChange,
  customer,
  onSuccess,
}: CustomerManagementDialogProps) => {
  const { user, companyId } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendWelcomeEmail, setSendWelcomeEmail] = useState(false);
  const [internPocId, setInternPocId] = useState<string | null>(null);
  const [persons, setPersons] = useState<{ id: string; full_name?: string | null }[]>([]);
  const isCreating = !customer;

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      navn: "",
      kontaktperson: "",
      epost: "",
      telefon: "",
      adresse: "",
      merknader: "",
    },
  });

  // Fetch persons for intern POC selector
  useEffect(() => {
    if (!open || !user || !companyId) return;
    const fetchPersons = async () => {
      try {
        const { data: visibleIds } = await supabase.rpc("get_user_visible_company_ids", {
          _user_id: user.id,
        });
        const ids = visibleIds?.length ? visibleIds : [companyId];
        const { data } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("approved", true)
          .in("company_id", ids)
          .order("full_name");
        setPersons(data || []);
      } catch (e) {
        console.error("Error fetching persons for POC:", e);
      }
    };
    fetchPersons();
  }, [open, user, companyId]);

  useEffect(() => {
    if (open) {
      if (customer) {
        form.reset({
          navn: customer.navn,
          kontaktperson: customer.kontaktperson || "",
          epost: customer.epost || "",
          telefon: customer.telefon || "",
          adresse: customer.adresse || "",
          merknader: customer.merknader || "",
        });
        setInternPocId(customer.intern_poc_id || null);
      } else {
        form.reset({
          navn: "",
          kontaktperson: "",
          epost: "",
          telefon: "",
          adresse: "",
          merknader: "",
        });
        setInternPocId(null);
      }
    }
  }, [open, customer, form]);

  const onSubmit = async (data: CustomerFormData) => {
    if (!user || !companyId) {
      toast.error("Du må være logget inn for å legge til kunder");
      return;
    }

    setIsSubmitting(true);
    
    try {
      const customerData = {
        navn: data.navn,
        kontaktperson: data.kontaktperson || null,
        epost: data.epost || null,
        telefon: data.telefon || null,
        adresse: data.adresse || null,
        merknader: data.merknader || null,
        intern_poc_id: internPocId,
        user_id: user.id,
        company_id: companyId,
      };

      if (isCreating) {
        const { data: insertedCustomer, error } = await supabase
          .from("customers")
          .insert(customerData)
          .select()
          .single();

        if (error) throw error;

        // Send welcome email if customer has email and checkbox is checked
        if (data.epost && sendWelcomeEmail) {
          try {
            // Get company name
            const { data: companyData } = await supabase
              .from("companies")
              .select("navn")
              .eq("id", companyId)
              .single();

            await supabase.functions.invoke("send-customer-welcome-email", {
              body: {
                customer_id: insertedCustomer.id,
                customer_name: data.navn,
                customer_email: data.epost,
                company_name: companyData?.navn || "Selskapet",
                company_id: companyId,
              },
            });
            console.log("Welcome email sent to customer");
          } catch (emailError) {
            console.error("Failed to send welcome email:", emailError);
            toast.warning("Kunde opprettet, men velkomst-e-post kunne ikke sendes. Sjekk at vedlegg ikke er for store.");
          }
        }

        toast.success("Kunde opprettet");
      } else {
        const { error } = await supabase
          .from("customers")
          .update({
            navn: data.navn,
            kontaktperson: data.kontaktperson || null,
            epost: data.epost || null,
            telefon: data.telefon || null,
            adresse: data.adresse || null,
            merknader: data.merknader || null,
            intern_poc_id: internPocId,
          })
          .eq("id", customer.id);

        if (error) throw error;
        toast.success("Kunde oppdatert");
      }

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error saving customer:", error);
      toast.error("Kunne ikke lagre kunde: " + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isCreating ? "Opprett ny kunde" : "Rediger kunde"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="navn"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kundenavn *</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn kundenavn" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="kontaktperson"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Kontaktperson</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn kontaktperson" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <FormLabel>Intern POC</FormLabel>
              <SearchablePersonSelect
                persons={persons}
                value={internPocId}
                onValueChange={setInternPocId}
                placeholder="Velg intern kontaktperson..."
                searchPlaceholder="Søk person..."
                emptyText="Ingen personer funnet."
                allowNone
                noneLabel="Ingen"
              />
            </div>

            <FormField
              control={form.control}
              name="epost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-post</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="email"
                      placeholder="kontakt@kunde.no"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isCreating && form.watch("epost") && (
              <div className="flex items-center space-x-2 p-4 rounded-lg bg-muted/50 border border-primary/20">
                <Checkbox
                  id="sendWelcomeEmail"
                  checked={sendWelcomeEmail}
                  onCheckedChange={(checked) => setSendWelcomeEmail(checked === true)}
                />
                <label
                  htmlFor="sendWelcomeEmail"
                  className="text-sm font-medium leading-none cursor-pointer"
                >
                  Send velkomst-e-post til kunde
                </label>
              </div>
            )}

            <FormField
              control={form.control}
              name="telefon"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefon</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+47 123 45 678" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="adresse"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Adresse</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Skriv inn adresse" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="merknader"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Merknader</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Eventuelle merknader..."
                      rows={3}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Avbryt
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCreating ? "Opprett" : "Lagre"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};
