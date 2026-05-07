import { useState, useEffect, useRef } from "react";
import { User, Upload, Lock, Heart, Bell, AlertCircle, Camera, Save, Book, Award, Smartphone, PenTool, ClipboardCheck, CheckCircle2, MapPin, Calendar, MessageSquare, Send, Activity, CreditCard, Trash2, ArrowUpRight, Loader2, GraduationCap } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { IncidentDetailDialog } from "./dashboard/IncidentDetailDialog";
import { AddIncidentDialog } from "./dashboard/AddIncidentDialog";
import { PersonCompetencyDialog } from "./resources/PersonCompetencyDialog";
import { FlightLogbookDialog } from "./FlightLogbookDialog";
import { MissionDetailDialog } from "./dashboard/MissionDetailDialog";
import { SignaturePad } from "./SignaturePad";
import { TakeCourseDialog } from "./training/TakeCourseDialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { PLANS } from "@/config/subscriptionPlans";
import { TwoFactorSetup } from "./TwoFactorSetup";
import { PasskeySetup } from "./PasskeySetup";

interface Profile {
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  telefon: string | null;
  adresse: string | null;
  tittel: string | null;
  nødkontakt_navn: string | null;
  nødkontakt_telefon: string | null;
  created_at: string | null;
  company_id: string;
  signature_url: string | null;
  uas_operator_number: string | null;
}

interface Company {
  navn: string;
}

interface Competency {
  id: string;
  navn: string;
  type: string;
  beskrivelse: string | null;
  utstedt_dato: string | null;
  utloper_dato: string | null;
  påvirker_status?: boolean;
}

interface Incident {
  id: string;
  tittel: string;
  hendelsestidspunkt: string;
  status: string;
  alvorlighetsgrad: string;
  beskrivelse: string | null;
  kategori: string | null;
  lokasjon: string | null;
  mission_id: string | null;
  oppdatert_dato: string | null;
  oppfolgingsansvarlig_id: string | null;
  opprettet_dato: string | null;
  rapportert_av: string | null;
  user_id: string | null;
  company_id: string;
  hovedaarsak: string | null;
  medvirkende_aarsak: string | null;
  incident_number: string | null;
  bilde_url: string | null;
  pilot_id: string | null;
  drone_id: string | null;
  equipment_ids: string[] | null;
  reported_anonymously: boolean;
}

interface NotificationPreferences {
  id: string;
  user_id: string;
  email_new_incident: boolean;
  email_new_mission: boolean;
  email_document_expiry: boolean;
  email_new_user_pending: boolean;
  email_followup_assigned: boolean;
  email_child_incidents: boolean;
  email_child_missions: boolean;
  email_child_new_user_pending: boolean;
  email_child_document_expiry: boolean;
  email_child_maintenance_reminder: boolean;
  email_inspection_reminder: boolean;
  inspection_reminder_days: number;
  push_enabled: boolean;
  push_document_expiry: boolean;
  push_maintenance_reminder: boolean;
  push_competency_expiry: boolean;
  push_mission_reminder: boolean;
  mission_reminder_hours: number;
  created_at: string;
  updated_at: string;
}

const severityColors = {
  Lav: "bg-blue-500/20 text-blue-700 dark:text-blue-300 border-blue-500/30",
  Middels: "bg-status-yellow/20 text-yellow-700 dark:text-yellow-300 border-status-yellow/30",
  Høy: "bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30",
  Kritisk: "bg-status-red/20 text-red-700 dark:text-red-300 border-status-red/30",
};

export const ProfileDialog = () => {
  const { user, subscribed, subscriptionEnd, subscriptionLoading, cancelAtPeriodEnd, isTrial, trialEnd, stripeExempt, subscriptionPlan, subscriptionAddons, isBillingOwner, seatCount, companyId, parentCompanyId, accessibleCompanies, signOut, checkSubscription, isAdmin: authIsAdmin, userRole: authUserRole } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { isSupported: pushSupported, isSubscribed: pushSubscribed, isLoading: pushLoading, permission: pushPermission, subscribe: subscribePush, unsubscribe: unsubscribePush, sendTestNotification } = usePushNotifications();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [userRole, setUserRole] = useState<string | null>(authUserRole);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [followUpIncidents, setFollowUpIncidents] = useState<Incident[]>([]);
  const [pendingApprovalMissions, setPendingApprovalMissions] = useState<any[]>([]);
  const [pendingTraining, setPendingTraining] = useState<any[]>([]);
  const [takeCourseAssignmentId, setTakeCourseAssignmentId] = useState<string | null>(null);
  const [canApproveMissions, setCanApproveMissions] = useState(false);
  const [preventSelfApproval, setPreventSelfApproval] = useState(false);
  const [canBeIncidentResponsible, setCanBeIncidentResponsible] = useState(false);
  const [approvingMissionId, setApprovingMissionId] = useState<string | null>(null);
  const [approvalComment, setApprovalComment] = useState("");
  const [activeTab, setActiveTab] = useState("profile");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [commentingMissionId, setCommentingMissionId] = useState<string | null>(null);
  const [missionComment, setMissionComment] = useState("");
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [incidentDialogOpen, setIncidentDialogOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const isAdmin = authIsAdmin;
  const [notificationPrefs, setNotificationPrefs] = useState<NotificationPreferences | null>(null);
  const [missionReminderHoursDraft, setMissionReminderHoursDraft] = useState<string>("24");
  const [isEditing, setIsEditing] = useState(false);
  const [editedProfile, setEditedProfile] = useState<Partial<Profile>>({});
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [competencyDialogOpen, setCompetencyDialogOpen] = useState(false);
  const [logbookDialogOpen, setLogbookDialogOpen] = useState(false);
  const [editIncidentDialogOpen, setEditIncidentDialogOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<Incident | null>(null);
  const [selectedMission, setSelectedMission] = useState<any>(null);
  const [missionDetailOpen, setMissionDetailOpen] = useState(false);
   const [feedbackOpen, setFeedbackOpen] = useState(false);
   const [feedbackSubject, setFeedbackSubject] = useState("");
   const [feedbackMessage, setFeedbackMessage] = useState("");
   const [feedbackSending, setFeedbackSending] = useState(false);
   const [feedbackImage, setFeedbackImage] = useState<File | null>(null);
   const [feedbackImagePreview, setFeedbackImagePreview] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>(localStorage.getItem('avisafe_app_version') || '–');
  const [changingPlan, setChangingPlan] = useState<string | null>(null);
  const [togglingAddon, setTogglingAddon] = useState<string | null>(null);
  const canConfigureChildNotifications = isAdmin && !parentCompanyId && accessibleCompanies.some((c) => c.id === companyId && c.isParent);

  // Fast badge-count effect: runs immediately on mount, independent of heavy fetchUserData
  useEffect(() => {
    if (!user) return;

    const fetchBadgeCounts = async () => {
      try {
        // Run incident count and approval check in parallel
        const [incidentsResult, approvalResult, trainingResult] = await Promise.all([
          supabase
            .from("incidents")
            .select("id, tittel, hendelsestidspunkt, status, alvorlighetsgrad, beskrivelse, kategori, lokasjon, mission_id, oppdatert_dato, oppfolgingsansvarlig_id, opprettet_dato, rapportert_av, user_id, company_id, hovedaarsak, medvirkende_aarsak, incident_number, bilde_url, pilot_id, drone_id, equipment_ids, reported_anonymously")
            .eq("oppfolgingsansvarlig_id", user.id)
            .neq("status", "Lukket")
            .order("hendelsestidspunkt", { ascending: false }),
          supabase
            .from("profiles")
            .select("can_approve_missions, company_id")
            .eq("id", user.id)
            .single(),
          supabase
            .from("training_assignments")
            .select("id, course_id, saved_answers, training_courses(title, description)")
            .eq("profile_id", user.id)
            .is("completed_at", null),
        ]);

        if (incidentsResult.data) {
          setFollowUpIncidents(incidentsResult.data);
        }

        if (trainingResult.data) {
          setPendingTraining(trainingResult.data);
        }

        if (approvalResult.data?.can_approve_missions && approvalResult.data.company_id) {
          setCanApproveMissions(true);
          const { data: pendingMissions } = await supabase
            .from("missions")
            .select("*")
            .eq("approval_status", "pending_approval")
            .eq("company_id", approvalResult.data.company_id)
            .order("submitted_for_approval_at", { ascending: false });

          if (pendingMissions) {
            setPendingApprovalMissions(pendingMissions);
          }
        }
      } catch (err) {
        console.error("Error fetching badge counts:", err);
      }
    };

    fetchBadgeCounts();
  }, [user]);

  // Only fetch heavy user data when dialog is actually opened
  useEffect(() => {
    if (user && profileDialogOpen) {
      fetchUserData();
      // Fetch app version from DB
      supabase
        .from('app_config')
        .select('value')
        .eq('key', 'app_version')
        .single()
        .then(({ data }) => {
          if (data?.value) {
            setAppVersion(data.value);
            localStorage.setItem('avisafe_app_version', data.value);
          }
        });
    }
  }, [user, profileDialogOpen]);

  useEffect(() => {
    if (notificationPrefs?.mission_reminder_hours === undefined || notificationPrefs?.mission_reminder_hours === null) return;
    setMissionReminderHoursDraft(String(notificationPrefs.mission_reminder_hours));
  }, [notificationPrefs?.mission_reminder_hours]);

  const fetchUserData = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch profile with all fields
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileData) {
        setProfile(profileData as unknown as Profile);
        setEditedProfile(profileData as unknown as Profile);
      }

      // Fetch company name
      if (profileData?.company_id) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("navn, prevent_self_approval")
          .eq("id", profileData.company_id)
          .single();

        if (companyData) {
          setCompany(companyData);
          setPreventSelfApproval((companyData as any).prevent_self_approval === true);
        }
      }

      // Fetch user's role (for display in profile, admin status comes from AuthContext)
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (roleData) {
        setUserRole(roleData.role);
      }

      // Fetch competencies
      const { data: competenciesData } = await supabase
        .from("personnel_competencies")
        .select("*")
        .eq("profile_id", user.id)
        .order("utloper_dato", { ascending: true });

      if (competenciesData) {
        setCompetencies(competenciesData);
      }

      // Fetch follow-up incidents (exclude only "Lukket" status)
      const { data: followUpIncidentsData } = await supabase
        .from("incidents")
        .select("*")
        .eq("oppfolgingsansvarlig_id", user.id)
        .neq("status", "Lukket")
        .order("hendelsestidspunkt", { ascending: false });

      if (followUpIncidentsData) {
        setFollowUpIncidents(followUpIncidentsData);
      }

      // Check if user can approve missions
      const { data: profileApproval } = await supabase
        .from("profiles")
        .select("can_approve_missions, can_be_incident_responsible, approval_company_ids, incident_responsible_company_ids")
        .eq("id", user.id)
        .single();

      const userCanApprove = profileApproval?.can_approve_missions === true;
      setCanApproveMissions(userCanApprove);
      setCanBeIncidentResponsible(profileApproval?.can_be_incident_responsible === true);

      // Fetch pending approval missions if user can approve
      if (userCanApprove && profileData?.company_id) {
        // Determine which companies this user can approve for
        const approvalIds = (profileApproval as any)?.approval_company_ids;
        let pendingQuery = supabase
          .from("missions")
          .select("*")
          .eq("approval_status", "pending_approval")
          .order("submitted_for_approval_at", { ascending: false });
        
        if (approvalIds && Array.isArray(approvalIds) && approvalIds.includes('all')) {
          // 'all' — fetch own company + all child companies
          const { data: childCos } = await supabase
            .from('companies')
            .select('id')
            .eq('parent_company_id', profileData.company_id);
          const allIds = [profileData.company_id, ...(childCos || []).map((c: any) => c.id)];
          pendingQuery = pendingQuery.in("company_id", allIds);
        } else if (approvalIds && Array.isArray(approvalIds)) {
          // Scoped to specific departments
          pendingQuery = pendingQuery.in("company_id", approvalIds);
        } else {
          // Legacy (null) - show own company
          pendingQuery = pendingQuery.eq("company_id", profileData.company_id);
        }

        const { data: pendingMissions } = await pendingQuery;

        // Fetch AI risk assessments for pending missions
        const missionIds = (pendingMissions || []).map((m: any) => m.id);
        let riskMap: Record<string, any> = {};
        let personnelMap: Record<string, string[]> = {};
        if (missionIds.length > 0) {
          const [riskResult, personnelResult] = await Promise.all([
            supabase
              .from("mission_risk_assessments")
              .select("*")
              .in("mission_id", missionIds)
              .order("created_at", { ascending: false }),
            supabase
              .from("mission_personnel")
              .select("mission_id, profile_id")
              .in("mission_id", missionIds),
          ]);

          if (riskResult.data) {
            for (const r of riskResult.data) {
              if (!riskMap[r.mission_id]) {
                riskMap[r.mission_id] = r;
              }
            }
          }

          if (personnelResult.data) {
            for (const p of personnelResult.data as any[]) {
              if (!personnelMap[p.mission_id]) personnelMap[p.mission_id] = [];
              if (p.profile_id) personnelMap[p.mission_id].push(p.profile_id);
            }
          }
        }

        setPendingApprovalMissions(
          (pendingMissions || []).map((m: any) => ({
            ...m,
            aiRisk: riskMap[m.id] || null,
            personnel_profile_ids: personnelMap[m.id] || [],
          }))
        );
      } else {
        setPendingApprovalMissions([]);
      }

      // Fetch pending training assignments
      const { data: trainingData } = await supabase
        .from("training_assignments")
        .select("id, course_id, saved_answers, training_courses(title, description)")
        .eq("profile_id", user.id)
        .is("completed_at", null);
      setPendingTraining(trainingData || []);

      // Fetch notification preferences
      const { data: prefsData } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!prefsData) {
        const { data: newPrefs } = await supabase
          .from("notification_preferences")
          .insert({
            user_id: user.id,
            email_new_incident: false,
            email_new_mission: false,
            email_document_expiry: false,
            email_new_user_pending: false,
            email_followup_assigned: true,
            email_child_incidents: true,
            email_child_missions: true,
            email_child_new_user_pending: true,
            email_child_document_expiry: true,
            email_child_maintenance_reminder: true,
            email_inspection_reminder: false,
            inspection_reminder_days: 14,
          })
          .select()
          .single();
        
        setNotificationPrefs(newPrefs);
      } else {
        setNotificationPrefs({
          ...prefsData,
          email_child_incidents: prefsData.email_child_incidents ?? true,
          email_child_missions: prefsData.email_child_missions ?? true,
          email_child_new_user_pending: prefsData.email_child_new_user_pending ?? true,
          email_child_document_expiry: prefsData.email_child_document_expiry ?? true,
          email_child_maintenance_reminder: prefsData.email_child_maintenance_reminder ?? true,
          email_inspection_reminder: prefsData.email_inspection_reminder ?? false,
          inspection_reminder_days: prefsData.inspection_reminder_days ?? 14,
        });
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const uploadAvatar = async (): Promise<string | null> => {
    if (!avatarFile || !user) return null;

    try {
      const fileExt = avatarFile.name.split('.').pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, avatarFile, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(fileName);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading avatar:", error);
      toast.error(t('profile.couldNotUploadPhoto'));
      return null;
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;

    try {
      let avatarUrl = editedProfile.avatar_url;

      // Upload avatar if changed
      if (avatarFile) {
        const newAvatarUrl = await uploadAvatar();
        if (newAvatarUrl) {
          avatarUrl = newAvatarUrl;
        }
      }

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: editedProfile.full_name,
          telefon: editedProfile.telefon,
          adresse: editedProfile.adresse,
          tittel: editedProfile.tittel,
          nødkontakt_navn: editedProfile.nødkontakt_navn,
          nødkontakt_telefon: editedProfile.nødkontakt_telefon,
          avatar_url: avatarUrl,
          uas_operator_number: editedProfile.uas_operator_number || null,
        })
        .eq("id", user.id);

      if (error) throw error;

      toast.success(t('profile.profileUpdated'));
      setIsEditing(false);
      setAvatarFile(null);
      setAvatarPreview(null);
      fetchUserData();
    } catch (error) {
      console.error("Error updating profile:", error);
      toast.error(t('profile.couldNotUpdateProfile'));
    }
  };

  const handlePasswordReset = async () => {
    if (!user?.email) return;

    setPasswordResetLoading(true);
    try {
      const { error } = await supabase.functions.invoke('send-password-reset', {
        body: { email: user.email }
      });

      if (error) throw error;

      toast.success(t('profile.resetEmailSent'));
    } catch (error: any) {
      console.error("Error sending password reset:", error);
      toast.error(error.message || t('profile.couldNotSendEmail'));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const updateNotificationPref = async (field: keyof NotificationPreferences, value: boolean | number) => {
    if (!user || !notificationPrefs) return;
    
    setNotificationPrefs({ ...notificationPrefs, [field]: value });
    
    try {
      const { error } = await supabase
        .from("notification_preferences")
        .update({ [field]: value })
        .eq("user_id", user.id);
      
      if (error) throw error;
      
      toast.success(t('profile.notificationSettings'));
    } catch (error: any) {
      console.error("Error updating notification preferences:", error);
      toast.error(t('profile.couldNotUpdateSettings'));
      // Revert to previous value
      if (typeof value === 'boolean') {
        setNotificationPrefs({ ...notificationPrefs, [field]: !value });
      }
    }
  };

  const getRoleBadgeVariant = (role: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (role) {
      case "superadmin":
        return "destructive";
      case "administrator":
      case "admin": // legacy
        return "default";
      case "bruker":
      default:
        return "secondary";
    }
  };

  const getRoleDisplayName = (role: string): string => {
    const roleMap: { [key: string]: string } = {
      superadmin: t('roles.superadmin'),
      administrator: t('roles.administrator'),
      bruker: t('roles.bruker'),
      // Legacy aliases
      admin: t('roles.administrator'),
      saksbehandler: t('roles.bruker'),
      operatør: t('roles.bruker'),
      lesetilgang: t('roles.bruker'),
    };
    return roleMap[role] || role;
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return t('common.notSet');
    return new Date(dateString).toLocaleDateString("no-NO", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const handleIncidentClick = (incident: Incident) => {
    setSelectedIncident(incident);
    setIncidentDialogOpen(true);
  };

  const handleEditIncidentRequest = (incident: Incident) => {
    setEditingIncident(incident);
    setEditIncidentDialogOpen(true);
  };

  const handleSaveComment = async (missionId: string) => {
    if (!user || !missionComment.trim()) return;
    try {
      const mission = pendingApprovalMissions.find((m: any) => m.id === missionId);
      const existingComments = Array.isArray(mission?.approver_comments) ? mission.approver_comments : [];
      const newComment = {
        author_id: user.id,
        author_name: profile?.full_name || user.email || 'Ukjent',
        comment: missionComment.trim(),
        created_at: new Date().toISOString(),
      };
      const updatedComments = [...existingComments, newComment];

      const { error } = await supabase
        .from('missions')
        .update({ approver_comments: updatedComments } as any)
        .eq('id', missionId);

      if (error) throw error;

      toast.success('Kommentar lagret');
      setCommentingMissionId(null);
      setMissionComment("");
      fetchUserData();
    } catch (error) {
      console.error('Error saving comment:', error);
      toast.error('Kunne ikke lagre kommentar');
    }
  };

  const handleNotifyPilot = async (missionId: string, comment: string) => {
    if (!user || !comment.trim()) {
      toast.error('Skriv en kommentar før du sender varsel');
      return;
    }
    try {
      const mission = pendingApprovalMissions.find((m: any) => m.id === missionId);
      if (!mission) return;

      const senderName = profile?.full_name || user.email || 'Ukjent';

      const { error } = await supabase.functions.invoke('send-notification-email', {
        body: {
          type: 'notify_pilot_comment',
          companyId: profile?.company_id,
          missionId: mission.id,
          pilotComment: {
            missionTitle: mission.tittel,
            missionLocation: mission.lokasjon || 'Ikke oppgitt',
            missionDate: mission.tidspunkt,
            comment: comment.trim(),
            senderName,
          },
        },
      });

      if (error) throw error;
      toast.success('Varsel sendt til pilot(er)');
    } catch (error) {
      console.error('Error sending pilot notification:', error);
      toast.error('Kunne ikke sende varsel');
    }
  };

  const handleApproveMission = async (missionId: string) => {
    if (!user) return;
    try {
      const mission = pendingApprovalMissions.find((m: any) => m.id === missionId);
      const assignedIds = Array.isArray(mission?.personnel_profile_ids) ? mission.personnel_profile_ids : [];
      if (preventSelfApproval && assignedIds.includes(user.id)) {
        toast.error('Du er satt som flyger/personell på dette oppdraget og kan derfor ikke godkjenne det.');
        return;
      }
      const existingComments = Array.isArray(mission?.approver_comments) ? mission.approver_comments : [];
      let updatedComments = existingComments;

      // If there's an approval comment, also add it to approver_comments
      if (approvalComment.trim()) {
        const newComment = {
          author_id: user.id,
          author_name: profile?.full_name || user.email || 'Ukjent',
          comment: approvalComment.trim(),
          created_at: new Date().toISOString(),
        };
        updatedComments = [...existingComments, newComment];
      }

      const { error } = await supabase
        .from('missions')
        .update({
          approval_status: 'approved',
          approved_by: user.id,
          approved_at: new Date().toISOString(),
          approval_comment: approvalComment || null,
          approver_comments: updatedComments,
        } as any)
        .eq('id', missionId);

      if (error) throw error;

      // Send email notification to pilots
      try {
        await supabase.functions.invoke('send-notification-email', {
          body: {
            type: 'notify_mission_approved',
            missionId,
            companyId: profile?.company_id,
          },
        });
      } catch (emailError) {
        console.error('Error sending approval email:', emailError);
      }

      toast.success('Oppdraget er godkjent');
      setApprovingMissionId(null);
      setApprovalComment("");
      fetchUserData();
    } catch (error) {
      console.error('Error approving mission:', error);
      toast.error('Kunne ikke godkjenne oppdraget');
    }
  };

  const isCompetencyExpiring = (date: string | null) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const today = new Date();
    const daysUntilExpiry = Math.floor((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return daysUntilExpiry <= 30 && daysUntilExpiry >= 0;
  };

  const isCompetencyExpired = (date: string | null) => {
    if (!date) return false;
    const expiryDate = new Date(date);
    const today = new Date();
    return expiryDate < today;
  };

  const location = useLocation();

  // Listen for open-profile-subscription event and location state
  useEffect(() => {
    const handler = () => {
      setProfileDialogOpen(true);
      setActiveTab('subscription');
    };
    window.addEventListener('open-profile-subscription', handler);
    return () => window.removeEventListener('open-profile-subscription', handler);
  }, []);

  useEffect(() => {
    if ((location.state as any)?.openSubscription) {
      setProfileDialogOpen(true);
      setActiveTab('subscription');
      // Clear the state so it doesn't re-trigger
      window.history.replaceState({}, '');
    }
  }, [location.state]);

  return (
    <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" title={t('profile.title')} className="relative h-7 w-7 min-w-7 p-0 md:h-8 md:w-8">
          <User className="w-3.5 h-3.5 md:w-4 md:h-4" />
          {(followUpIncidents.length + pendingApprovalMissions.length + pendingTraining.length) > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs rounded-full"
            >
              {followUpIncidents.length + pendingApprovalMissions.length + pendingTraining.length}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[90vh] top-[5%] translate-y-0 data-[state=open]:slide-in-from-top-[5%]">
        <DialogHeader>
        <DialogTitle>{t('profile.title')}</DialogTitle>
      </DialogHeader>
        <ScrollArea className="max-h-[calc(90vh-100px)] pr-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <p className="text-muted-foreground">{t('common.loading')}</p>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className={`grid w-full grid-cols-3 md:grid-cols-4 gap-1.5 p-1.5 lg:p-1 bg-transparent lg:bg-muted relative z-10 ${canBeIncidentResponsible ? 'lg:grid-cols-7' : 'lg:grid-cols-6'}`}>
                <TabsTrigger value="profile" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <User className="h-3 w-3" />
                  <span>{t('profile.title').replace('Min ', '').replace('My ', '')}</span>
                </TabsTrigger>
                <TabsTrigger value="security" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Lock className="h-3 w-3" />
                  <span>{t('profile.security')}</span>
                </TabsTrigger>
                <TabsTrigger value="competencies" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Award className="h-3 w-3" />
                  <span>{t('profile.competencies')}</span>
                  {pendingTraining.length > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs leading-none rounded-full pointer-events-none shrink-0"
                    >
                      {pendingTraining.length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="emergency" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Heart className="h-3 w-3" />
                  <span>{t('profile.emergency')}</span>
                </TabsTrigger>
                <TabsTrigger value="notifications" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <Bell className="h-3 w-3" />
                  <span>{t('profile.notifications')}</span>
                </TabsTrigger>
                {canBeIncidentResponsible && (
                <TabsTrigger value="incidents" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0" style={{ touchAction: 'manipulation' }}>
                  <ClipboardCheck className="h-3 w-3" />
                  <span>Oppfølging</span>
                  {(followUpIncidents.length + pendingApprovalMissions.length) > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-1 h-5 min-w-5 px-1 flex items-center justify-center text-xs leading-none rounded-full pointer-events-none shrink-0"
                    >
                      {followUpIncidents.length + pendingApprovalMissions.length}
                    </Badge>
                  )}
                </TabsTrigger>
                )}
                <TabsTrigger value="subscription" className="flex items-center justify-center gap-1 text-xs sm:text-sm bg-muted lg:bg-transparent rounded-lg lg:rounded-sm border border-border lg:border-0">
                  <CreditCard className="h-3 w-3" />
                  <span>Abonnement</span>
                </TabsTrigger>
              </TabsList>

              {activeTab === "profile" && (
                <div className="mt-20 md:mt-14 lg:mt-4 mb-4 flex flex-col sm:flex-row flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFeedbackOpen(true)}
                    className="w-full sm:w-auto"
                  >
                    <MessageSquare className="h-4 w-4 mr-1" />
                    Gi tilbakemelding
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setProfileDialogOpen(false); navigate("/changelog"); }}
                    className="w-full sm:w-auto"
                  >
                    <Activity className="h-4 w-4 mr-1" />
                    Status og endringslogg
                  </Button>
                </div>
              )}

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-4 mt-2 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>{t('profile.info')}</CardTitle>
                      {!isEditing ? (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          {t('actions.edit')}
                        </Button>
                      ) : (
                        <div className="flex gap-2 w-full sm:w-auto">
                          <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                            <Save className="h-4 w-4 mr-1" />
                            {t('actions.save')}
                          </Button>
                          <Button
                            onClick={() => {
                              setIsEditing(false);
                              setEditedProfile(profile || {});
                              setAvatarFile(null);
                              setAvatarPreview(null);
                            }}
                            variant="outline"
                            size="sm"
                            className="flex-1 sm:flex-none"
                          >
                            {t('actions.cancel')}
                          </Button>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Avatar */}
                    <div className="flex flex-col sm:flex-row items-center gap-4">
                      <div className="relative group">
                        <Avatar className="h-24 w-24">
                          <AvatarImage src={avatarPreview || profile?.avatar_url || ""} />
                          <AvatarFallback className="text-2xl">
                            {profile?.full_name?.charAt(0) || user?.email?.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        {isEditing && (
                          <button
                            onClick={handleAvatarClick}
                            className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          >
                            <Camera className="h-6 w-6 text-white" />
                          </button>
                        )}
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleAvatarChange}
                          className="hidden"
                        />
                      </div>
                      <div className="flex-1 w-full space-y-2">
                        <div className="grid gap-2">
                          <Label>{t('profile.name')}</Label>
                          {isEditing ? (
                            <Input
                              value={editedProfile.full_name || ""}
                              onChange={(e) => setEditedProfile({ ...editedProfile, full_name: e.target.value })}
                              placeholder={t('forms.placeholder.fullName')}
                            />
                          ) : (
                            <p className="text-lg font-semibold">{profile?.full_name || t('common.notSet')}</p>
                          )}
                        </div>
                        <div className="grid gap-1">
                          <Label className="text-xs">UAS operatørnummer</Label>
                          {isEditing ? (
                            <Input
                              value={editedProfile.uas_operator_number || ""}
                              onChange={(e) => setEditedProfile({ ...editedProfile, uas_operator_number: e.target.value })}
                              placeholder="f.eks. NOR87astrdge12k"
                              className="h-8 text-sm"
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">{profile?.uas_operator_number || t('common.notSpecified')}</p>
                          )}
                          <p className="text-[10px] text-muted-foreground/70">
                            Fra Luftfartstilsynets flydrone-tjeneste. De siste sifrene er hemmelige og skal ikke tas med i merkingen.
                          </p>
                        </div>
                      </div>
                    </div>

                    <Separator />

                    {/* Basic Info */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>{t('auth.email')}</Label>
                        <Input value={profile?.email || user?.email || ""} disabled className="bg-muted" />
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.phone')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, telefon: e.target.value })}
                            placeholder={t('forms.placeholder.phone')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.telefon || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.jobTitle')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.tittel || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, tittel: e.target.value })}
                            placeholder={t('forms.placeholder.jobTitle')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.tittel || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.company')}</Label>
                        <p className="text-sm py-2 font-medium">{company?.navn || t('common.notAssociated')}</p>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.role')}</Label>
                        <div className="py-1">
                          {userRole ? (
                            <Badge variant={getRoleBadgeVariant(userRole)}>
                              {getRoleDisplayName(userRole)}
                            </Badge>
                          ) : (
                            <p className="text-sm text-muted-foreground">{t('common.noRole')}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.memberSince')}</Label>
                        <p className="text-sm py-2">{formatDate(profile?.created_at)}</p>
                      </div>
                    </div>

                    <Separator />

                    {/* Address */}
                    <div className="space-y-2">
                      <Label>{t('profile.address')}</Label>
                      {isEditing ? (
                        <Textarea
                          value={editedProfile.adresse || ""}
                          onChange={(e) => setEditedProfile({ ...editedProfile, adresse: e.target.value })}
                          placeholder={t('forms.placeholder.address')}
                          rows={3}
                        />
                      ) : (
                        <p className="text-sm py-2 whitespace-pre-wrap">{profile?.adresse || t('common.notSpecified')}</p>
                      )}
                    </div>

                    <Separator />


                    {/* Signature */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <PenTool className="h-4 w-4" />
                        {t("profile.signature", "Signatur")}
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        {t(
                          "profile.signatureDescription",
                          "Signaturen brukes på eksporterte loggbøker og dokumenter."
                        )}
                      </p>
                      <SignaturePad 
                        existingSignatureUrl={profile?.signature_url}
                        onSave={(url) => {
                          if (profile) {
                            setProfile({ ...profile, signature_url: url });
                          }
                        }}
                      />
                    </div>

                  </CardContent>
                </Card>

                {/* Feedback Dialog */}
                <Dialog open={feedbackOpen} onOpenChange={(open) => {
                  setFeedbackOpen(open);
                  if (!open) {
                    setFeedbackSubject("");
                    setFeedbackMessage("");
                    setFeedbackImage(null);
                    if (feedbackImagePreview) {
                      URL.revokeObjectURL(feedbackImagePreview);
                      setFeedbackImagePreview(null);
                    }
                  }
                }}>
                  <DialogContent className="max-w-md">
                    <DialogHeader>
                      <DialogTitle>Gi tilbakemelding</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Overskrift</Label>
                        <Input
                          value={feedbackSubject}
                          onChange={(e) => setFeedbackSubject(e.target.value)}
                          placeholder="Hva gjelder tilbakemeldingen?"
                          maxLength={200}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Melding</Label>
                        <Textarea
                          value={feedbackMessage}
                          onChange={(e) => setFeedbackMessage(e.target.value)}
                          placeholder="Beskriv tilbakemeldingen din..."
                          rows={5}
                          maxLength={5000}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Vedlegg (valgfritt)</Label>
                        {feedbackImagePreview ? (
                          <div className="relative inline-block">
                            <img src={feedbackImagePreview} alt="Vedlegg" className="max-h-32 rounded-md border border-border" />
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
                              onClick={() => {
                                setFeedbackImage(null);
                                URL.revokeObjectURL(feedbackImagePreview);
                                setFeedbackImagePreview(null);
                              }}
                            >
                              ×
                            </Button>
                          </div>
                        ) : (
                          <div>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              id="feedback-image-input"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  if (file.size > 5 * 1024 * 1024) {
                                    toast.error("Bildet kan ikke være større enn 5 MB");
                                    return;
                                  }
                                  setFeedbackImage(file);
                                  setFeedbackImagePreview(URL.createObjectURL(file));
                                }
                                e.target.value = "";
                              }}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById("feedback-image-input")?.click()}
                              type="button"
                            >
                              <Camera className="h-4 w-4 mr-1" />
                              Legg til bilde
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => setFeedbackOpen(false)}
                          disabled={feedbackSending}
                        >
                          Avbryt
                        </Button>
                        <Button
                          onClick={async () => {
                            if (!feedbackSubject.trim() || !feedbackMessage.trim()) {
                              toast.error("Fyll ut både overskrift og melding");
                              return;
                            }
                            setFeedbackSending(true);
                            try {
                              let imageUrl: string | undefined;
                              if (feedbackImage) {
                                const ext = feedbackImage.name.split('.').pop() || 'jpg';
                                const filePath = `${user?.id}-${Date.now()}.${ext}`;
                                const buf = await feedbackImage.arrayBuffer();
                                const safeFile = new File([buf], feedbackImage.name, { type: feedbackImage.type });
                                const { error: uploadError } = await supabase.storage
                                  .from('feedback-attachments')
                                  .upload(filePath, safeFile);
                                if (uploadError) throw uploadError;
                                const { data: urlData } = supabase.storage
                                  .from('feedback-attachments')
                                  .getPublicUrl(filePath);
                                imageUrl = urlData.publicUrl;
                              }
                              const { error } = await supabase.functions.invoke('send-feedback', {
                                body: { subject: feedbackSubject.trim(), message: feedbackMessage.trim(), imageUrl },
                              });
                              if (error) throw error;
                              toast.success("Tilbakemelding sendt! Takk for innspillet.");
                              setFeedbackOpen(false);
                              setFeedbackSubject("");
                              setFeedbackMessage("");
                              setFeedbackImage(null);
                              if (feedbackImagePreview) {
                                URL.revokeObjectURL(feedbackImagePreview);
                                setFeedbackImagePreview(null);
                              }
                            } catch (err: any) {
                              console.error("Error sending feedback:", err);
                              toast.error(err.message || "Kunne ikke sende tilbakemelding");
                            } finally {
                              setFeedbackSending(false);
                            }
                          }}
                          disabled={feedbackSending || !feedbackSubject.trim() || !feedbackMessage.trim()}
                        >
                          <Send className="h-4 w-4 mr-1" />
                          {feedbackSending ? "Sender..." : "Send"}
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              {/* Security Tab */}
              <TabsContent value="security" className="space-y-4 mt-20 md:mt-14 lg:mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('profile.security')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label>{t('profile.passwordReset')}</Label>
                      <p className="text-sm text-muted-foreground mb-3">
                        {t('profile.passwordResetDesc')}
                      </p>
                      <Button
                        onClick={handlePasswordReset}
                        disabled={passwordResetLoading}
                        variant="outline"
                      >
                        <Lock className="h-4 w-4 mr-2" />
                        {passwordResetLoading ? t('profile.sendingEmail') : t('profile.resetPassword')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <TwoFactorSetup />

                <PasskeySetup />

                <Card className="border-destructive/30">
                  <CardHeader>
                    <CardTitle className="text-destructive">{t('profile.deleteAccount')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {t('profile.deleteAccountDesc')}
                    </p>
                    <Button
                      variant="destructive"
                      onClick={() => {
                        setDeleteConfirmEmail("");
                        setDeleteDialogOpen(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('profile.deleteAccount')}
                    </Button>
                  </CardContent>
                </Card>

                <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('profile.deleteAccountConfirmTitle')}</AlertDialogTitle>
                      <AlertDialogDescription className="space-y-3">
                        <span className="block">{t('profile.deleteAccountConfirmDesc')}</span>
                        <span className="block font-medium text-foreground">{t('profile.deleteAccountTypeEmail')}</span>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <Input
                      placeholder={user?.email ?? ""}
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      className="mt-2"
                    />
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={deleteLoading}>{t('actions.cancel')}</AlertDialogCancel>
                      <Button
                        variant="destructive"
                        disabled={deleteLoading || deleteConfirmEmail.toLowerCase() !== (user?.email ?? "").toLowerCase()}
                        onClick={async () => {
                          setDeleteLoading(true);
                          try {
                            const { error } = await supabase.functions.invoke('delete-own-account');
                            if (error) throw error;
                            toast.success(t('profile.deleteAccountSuccess'));
                            setDeleteDialogOpen(false);
                            await signOut();
                          } catch (err: any) {
                            console.error("Error deleting account:", err);
                            toast.error(err.message || t('profile.deleteAccountError'));
                          } finally {
                            setDeleteLoading(false);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {deleteLoading ? t('profile.deletingAccount') : t('profile.deleteAccountConfirm')}
                      </Button>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </TabsContent>

              {/* Competencies Tab */}
              <TabsContent value="competencies" className="space-y-4 mt-20 md:mt-14 lg:mt-4 min-h-[400px] sm:min-h-0">
                {/* Pending Training */}
                {pendingTraining.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <GraduationCap className="h-5 w-5 shrink-0" />
                        <span className="break-words">Kurs og tester ({pendingTraining.length})</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {pendingTraining.map((assignment: any) => {
                          const savedAnswers = assignment.saved_answers as Record<string, string> | null;
                          const hasStarted = !!savedAnswers;

                          return (
                            <div
                              key={assignment.id}
                              className="flex flex-col gap-2 p-3 rounded-lg border border-border"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-sm break-words">
                                    {(assignment.training_courses as any)?.title || "Kurs"}
                                  </p>
                                  {(assignment.training_courses as any)?.description && (
                                    <p className="text-xs text-muted-foreground line-clamp-2">
                                      {(assignment.training_courses as any).description}
                                    </p>
                                  )}
                                  {hasStarted && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                      ⏳ Påbegynt
                                    </p>
                                  )}
                                </div>
                                <Button
                                  size="sm"
                                  className="self-start sm:self-center shrink-0"
                                  onClick={() => setTakeCourseAssignmentId(assignment.id)}
                                >
                                  <GraduationCap className="h-4 w-4 mr-1" />
                                  {hasStarted ? "Fortsett kurs" : "Ta kurs"}
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card className="border-0 shadow-none sm:border sm:shadow-sm">
                  <CardHeader className="px-2 sm:px-6">
                    <div className="flex flex-col items-center gap-2">
                      <CardTitle className="text-center">{t('profile.myCompetencies')} ({competencies.length})</CardTitle>
                      <div className="flex gap-2 w-full sm:w-auto">
                        <Button 
                          onClick={() => setLogbookDialogOpen(true)} 
                          size="sm"
                          variant="outline"
                          className="flex-1 sm:flex-none"
                        >
                          <Book className="h-4 w-4 mr-1" />
                          {t('profile.logbook')}
                        </Button>
                        <Button 
                          onClick={() => setCompetencyDialogOpen(true)} 
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          {t('actions.add')}
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-2 sm:px-6">
                    {competencies.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 overflow-hidden">
                        {competencies.map((comp) => {
                          const expired = isCompetencyExpired(comp.utloper_dato);
                          const expiring = isCompetencyExpiring(comp.utloper_dato);
                          return (
                            <div
                              key={comp.id}
                              onClick={() => setCompetencyDialogOpen(true)}
                              className={`p-3 sm:p-4 rounded-lg border transition-all duration-200 hover:shadow-lg hover:scale-[1.01] min-w-0 overflow-hidden cursor-pointer ${
                                expired
                                  ? "border-destructive/40 bg-destructive/5 hover:border-destructive/60"
                                  : expiring
                                  ? "border-yellow-500/40 bg-yellow-500/5 hover:border-yellow-500/60"
                                  : "border-border bg-background/50 hover:border-primary/50 hover:bg-background/70"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-1.5 mb-2 min-w-0">
                                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                  <div className={`shrink-0 h-7 w-7 sm:h-8 sm:w-8 rounded-full flex items-center justify-center ${
                                    expired
                                      ? "bg-destructive/15 text-destructive"
                                      : expiring
                                      ? "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400"
                                      : "bg-primary/10 text-primary"
                                  }`}>
                                    <Award className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                  </div>
                                  <h4 className="font-semibold text-xs sm:text-sm truncate min-w-0">{comp.navn}</h4>
                                </div>
                                <Badge variant={expired ? "destructive" : expiring ? "outline" : "secondary"} className="text-[10px] sm:text-xs shrink-0">
                                  {comp.type}
                                </Badge>
                              </div>
                              {comp.beskrivelse && (
                                <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{comp.beskrivelse}</p>
                              )}
                              <Separator className="mb-3" />
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs text-muted-foreground">
                                {comp.utstedt_dato && (
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span>{t('profile.issued')}: {formatDate(comp.utstedt_dato)}</span>
                                  </div>
                                )}
                                {comp.utloper_dato && (
                                  <div className={`flex items-center gap-1 ${
                                    expired
                                      ? "text-destructive font-semibold"
                                      : expiring
                                      ? "text-yellow-600 dark:text-yellow-400 font-semibold"
                                      : ""
                                  }`}>
                                    {(expired || expiring) && <AlertCircle className="h-3 w-3" />}
                                    <span>{t('profile.expires')}: {formatDate(comp.utloper_dato)}</span>
                                  </div>
                                )}
                              </div>
                              {expired && (
                                <div className="mt-2 flex items-center gap-1 text-xs text-destructive font-medium">
                                  <AlertCircle className="h-3 w-3" />
                                  Utløpt
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Award className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                        <p className="text-sm text-muted-foreground">{t('profile.noCompetencies')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Emergency Contact Tab */}
              <TabsContent value="emergency" className="space-y-4 mt-20 md:mt-14 lg:mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                      <CardTitle>{t('profile.emergency')}</CardTitle>
                      {!isEditing && (
                        <Button onClick={() => setIsEditing(true)} size="sm" className="w-full sm:w-auto">
                          {t('actions.edit')}
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {t('profile.emergencyInfo')}
                    </p>
                    <Separator />
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>{t('profile.emergencyContactName')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_navn || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_navn: e.target.value })}
                            placeholder={t('forms.placeholder.fullName')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_navn || t('common.notSpecified')}</p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label>{t('profile.emergencyContactPhone')}</Label>
                        {isEditing ? (
                          <Input
                            value={editedProfile.nødkontakt_telefon || ""}
                            onChange={(e) => setEditedProfile({ ...editedProfile, nødkontakt_telefon: e.target.value })}
                            placeholder={t('forms.placeholder.phone')}
                          />
                        ) : (
                          <p className="text-sm py-2">{profile?.nødkontakt_telefon || t('common.notSpecified')}</p>
                        )}
                      </div>
                    </div>

                    <Separator />
                    <div className="space-y-2">
                      <Label className="text-muted-foreground text-xs font-medium uppercase tracking-wide">Nødnumre</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <a href="tel:110" className="flex flex-col items-center gap-1 rounded-lg border-2 border-primary/30 bg-muted/30 p-3 text-center hover:bg-muted/50 transition-colors">
                          <span className="text-lg font-bold">110</span>
                          <span className="text-xs text-muted-foreground">Brann</span>
                        </a>
                        <a href="tel:112" className="flex flex-col items-center gap-1 rounded-lg border-2 border-primary/30 bg-muted/30 p-3 text-center hover:bg-muted/50 transition-colors">
                          <span className="text-lg font-bold">112</span>
                          <span className="text-xs text-muted-foreground">Politi</span>
                        </a>
                        <a href="tel:113" className="flex flex-col items-center gap-1 rounded-lg border-2 border-primary/30 bg-muted/30 p-3 text-center hover:bg-muted/50 transition-colors">
                          <span className="text-lg font-bold">113</span>
                          <span className="text-xs text-muted-foreground">Ambulanse</span>
                        </a>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="flex gap-2 pt-4">
                        <Button onClick={handleSaveProfile} size="sm" className="flex-1 sm:flex-none">
                          <Save className="h-4 w-4 mr-1" />
                          {t('actions.save')}
                        </Button>
                        <Button
                          onClick={() => {
                            setIsEditing(false);
                            setEditedProfile(profile || {});
                          }}
                          variant="outline"
                          size="sm"
                          className="flex-1 sm:flex-none"
                        >
                          {t('actions.cancel')}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Notifications Tab */}
              <TabsContent value="notifications" className="space-y-4 mt-20 md:mt-14 lg:mt-4 min-h-[400px] sm:min-h-0">
                <Card>
                  <CardHeader>
                    <CardTitle>{t('profile.notifications')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.newIncidents')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newIncidentsDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_new_incident ?? false}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_new_incident', checked)
                          }
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.newMissions')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newMissionsDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_new_mission ?? false}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_new_mission', checked)
                          }
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.documentExpiry')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.documentExpiryDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_document_expiry ?? false}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_document_expiry', checked)
                          }
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.newUserPending')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.newUserPendingDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_new_user_pending ?? false}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_new_user_pending', checked)
                          }
                          disabled={!isAdmin}
                        />
                      </div>

                      {/* Mission approval notification - only shown for approvers */}
                      {canApproveMissions && (
                        <>
                          <Separator />
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5 flex-1">
                              <label className="text-sm font-medium">
                                Oppdrag til godkjenning
                              </label>
                              <p className="text-xs text-muted-foreground">
                                Motta e-post når oppdrag sendes til godkjenning
                              </p>
                            </div>
                            <Switch
                              checked={(notificationPrefs as any)?.email_mission_approval ?? false}
                              onCheckedChange={(checked) => 
                                updateNotificationPref('email_mission_approval' as any, checked)
                              }
                            />
                          </div>
                        </>
                      )}
                      
                      <Separator />
                      
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 flex-1">
                          <label className="text-sm font-medium">
                            {t('profile.notificationOptions.followupAssigned')}
                          </label>
                          <p className="text-xs text-muted-foreground">
                            {t('profile.notificationOptions.followupAssignedDesc')}
                          </p>
                        </div>
                        <Switch
                          checked={notificationPrefs?.email_followup_assigned ?? true}
                          onCheckedChange={(checked) => 
                            updateNotificationPref('email_followup_assigned', checked)
                          }
                        />
                      </div>
                      
                      <Separator />
                      
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5 flex-1">
                            <label className="text-sm font-medium">
                              {t('profile.notificationOptions.inspectionReminder')}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {t('profile.notificationOptions.inspectionReminderDesc')}
                            </p>
                          </div>
                          <Switch
                            checked={notificationPrefs?.email_inspection_reminder ?? false}
                            onCheckedChange={(checked) => 
                              updateNotificationPref('email_inspection_reminder', checked)
                            }
                          />
                        </div>
                      </div>

                      {canConfigureChildNotifications && (
                        <>
                          <Separator className="my-6" />
                          <div className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
                            <div className="space-y-1">
                              <h4 className="font-medium">Varslinger fra avdelinger</h4>
                              <p className="text-xs text-muted-foreground">
                                Gjelder hendelser og frister i avdelinger under mor-selskapet ditt.
                              </p>
                            </div>

                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">Nye hendelser i avdelinger</label>
                                <p className="text-xs text-muted-foreground">Motta e-post når en avdeling registrerer en hendelse.</p>
                              </div>
                              <Switch
                                checked={notificationPrefs?.email_child_incidents ?? true}
                                onCheckedChange={(checked) => updateNotificationPref('email_child_incidents', checked)}
                              />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">Nye oppdrag i avdelinger</label>
                                <p className="text-xs text-muted-foreground">Motta e-post når en avdeling oppretter et oppdrag.</p>
                              </div>
                              <Switch
                                checked={notificationPrefs?.email_child_missions ?? true}
                                onCheckedChange={(checked) => updateNotificationPref('email_child_missions', checked)}
                              />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">Nye brukere i avdelinger</label>
                                <p className="text-xs text-muted-foreground">Motta e-post når en bruker venter på godkjenning i en avdeling.</p>
                              </div>
                              <Switch
                                checked={notificationPrefs?.email_child_new_user_pending ?? true}
                                onCheckedChange={(checked) => updateNotificationPref('email_child_new_user_pending', checked)}
                              />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">Dokumenter som utløper i avdelinger</label>
                                <p className="text-xs text-muted-foreground">Motta e-post når dokumentfrister i avdelinger nærmer seg.</p>
                              </div>
                              <Switch
                                checked={notificationPrefs?.email_child_document_expiry ?? true}
                                onCheckedChange={(checked) => updateNotificationPref('email_child_document_expiry', checked)}
                              />
                            </div>

                            <Separator />

                            <div className="flex items-center justify-between gap-4">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">Vedlikehold i avdelinger</label>
                                <p className="text-xs text-muted-foreground">Motta e-post når ressurser i avdelinger krever vedlikehold eller inspeksjon.</p>
                              </div>
                              <Switch
                                checked={notificationPrefs?.email_child_maintenance_reminder ?? true}
                                onCheckedChange={(checked) => updateNotificationPref('email_child_maintenance_reminder', checked)}
                              />
                            </div>
                          </div>
                        </>
                      )}
                      
                      {/* Push Notifications Section */}
                      <Separator className="my-6" />
                      
                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-5 w-5" />
                          <h4 className="font-medium">{t('profile.pushNotifications')}</h4>
                        </div>
                        
                        {!pushSupported ? (
                          <p className="text-sm text-muted-foreground">{t('profile.pushNotSupported')}</p>
                        ) : pushPermission === 'denied' ? (
                          <p className="text-sm text-destructive">{t('profile.pushDenied')}</p>
                        ) : (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="space-y-0.5 flex-1">
                                <label className="text-sm font-medium">
                                  {t('profile.enablePush')}
                                </label>
                                <p className="text-xs text-muted-foreground">
                                  {t('profile.enablePushDesc')}
                                </p>
                              </div>
                              <Switch
                                checked={pushSubscribed}
                                onCheckedChange={(checked) => checked ? subscribePush() : unsubscribePush()}
                                disabled={pushLoading}
                              />
                            </div>
                            
                            {pushSubscribed && (
                              <>
                                <Separator />
                                
                                <div className="flex items-center justify-between">
                                  <div className="space-y-0.5 flex-1">
                                    <label className="text-sm font-medium">
                                      {t('profile.pushDocumentExpiry')}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                      {t('profile.pushDocumentExpiryDesc')}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={notificationPrefs?.push_document_expiry ?? true}
                                    onCheckedChange={(checked) => updateNotificationPref('push_document_expiry', checked)}
                                  />
                                </div>
                                
                                <Separator />
                                
                                <div className="flex items-center justify-between">
                                  <div className="space-y-0.5 flex-1">
                                    <label className="text-sm font-medium">
                                      {t('profile.pushMaintenanceReminder')}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                      {t('profile.pushMaintenanceReminderDesc')}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={notificationPrefs?.push_maintenance_reminder ?? true}
                                    onCheckedChange={(checked) => updateNotificationPref('push_maintenance_reminder', checked)}
                                  />
                                </div>
                                
                                <Separator />
                                
                                <div className="flex items-center justify-between">
                                  <div className="space-y-0.5 flex-1">
                                    <label className="text-sm font-medium">
                                      {t('profile.pushCompetencyExpiry')}
                                    </label>
                                    <p className="text-xs text-muted-foreground">
                                      {t('profile.pushCompetencyExpiryDesc')}
                                    </p>
                                  </div>
                                  <Switch
                                    checked={notificationPrefs?.push_competency_expiry ?? true}
                                    onCheckedChange={(checked) => updateNotificationPref('push_competency_expiry', checked)}
                                  />
                                </div>
                                
                                <Separator />
                                
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <div className="space-y-0.5 flex-1">
                                      <label className="text-sm font-medium">
                                        {t('profile.pushMissionReminder')}
                                      </label>
                                      <p className="text-xs text-muted-foreground">
                                        {t('profile.pushMissionReminderDesc')}
                                      </p>
                                    </div>
                                    <Switch
                                      checked={notificationPrefs?.push_mission_reminder ?? true}
                                      onCheckedChange={(checked) => updateNotificationPref('push_mission_reminder', checked)}
                                    />
                                  </div>
                                  {notificationPrefs?.push_mission_reminder && (
                                    <div className="flex items-center gap-2 pl-4">
                                      <Label className="text-sm text-muted-foreground whitespace-nowrap">
                                        {t('profile.hoursBeforeMission')}:
                                      </Label>
                                      <Input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        value={missionReminderHoursDraft}
                                        onChange={(e) => {
                                          const raw = e.target.value;
                                          if (raw === '' || /^\d+$/.test(raw)) {
                                            setMissionReminderHoursDraft(raw);
                                          }
                                        }}
                                        onBlur={() => {
                                          const parsed = Math.max(1, Math.min(72, parseInt(missionReminderHoursDraft || '24', 10) || 24));
                                          setMissionReminderHoursDraft(String(parsed));
                                          updateNotificationPref('mission_reminder_hours', parsed);
                                        }}
                                        className="w-20 h-8"
                                      />
                                    </div>
                                  )}
                                </div>
                                
                                <Separator />
                                
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={sendTestNotification}
                                  disabled={pushLoading}
                                >
                                  {t('profile.testPushNotification')}
                                </Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Oppfølging Tab */}
              <TabsContent value="incidents" className="space-y-4 mt-20 md:mt-14 lg:mt-4 min-h-[400px] sm:min-h-0 overflow-hidden min-w-0">
                {/* Pending Approval Missions */}
                {canApproveMissions && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <CheckCircle2 className="h-5 w-5" />
                        Oppdrag til godkjenning ({pendingApprovalMissions.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {pendingApprovalMissions.length > 0 ? (
                        <div className="space-y-4">
                          {pendingApprovalMissions.map((mission) => {
                            const selfApprovalBlocked = preventSelfApproval && Array.isArray(mission.personnel_profile_ids) && mission.personnel_profile_ids.includes(user?.id);
                            return (
                            <div
                              key={mission.id}
                              className="p-4 rounded-lg border-2 border-primary/30 bg-muted/30 space-y-2 cursor-pointer hover:bg-muted/50 transition-colors overflow-hidden min-w-0"
                              onClick={() => {
                                setSelectedMission(mission);
                                setMissionDetailOpen(true);
                              }}
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <p className="font-medium break-words">{mission.tittel}</p>
                                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground mt-1">
                                    {mission.lokasjon && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {mission.lokasjon}
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1">
                                      <Calendar className="h-3 w-3" />
                                      {new Date(mission.tidspunkt).toLocaleDateString("no-NO", { day: "2-digit", month: "short", year: "numeric" })}
                                    </span>
                                  </div>
                                  <Badge className="mt-1 text-xs" variant="outline">{mission.status}</Badge>
                                </div>
                              </div>
                              {/* Comment section */}
                              {commentingMissionId === mission.id && (
                                <div className="space-y-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                                  <Textarea
                                    placeholder="Skriv kommentar..."
                                    value={missionComment}
                                    onChange={(e) => setMissionComment(e.target.value)}
                                    rows={2}
                                    className="text-sm"
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="secondary" className="hover:bg-muted/50" onClick={async () => { await handleSaveComment(mission.id); await handleNotifyPilot(mission.id, missionComment); }}>
                                      <Send className="h-4 w-4 mr-1" />
                                      Send varsel til pilot
                                    </Button>
                                    <Button size="sm" variant="outline" className="hover:bg-muted/50" onClick={() => { setCommentingMissionId(null); setMissionComment(""); }}>
                                      Tilbake
                                    </Button>
                                  </div>
                                </div>
                              )}

                              {/* Approval section */}
                              {selfApprovalBlocked && (
                                <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive" onClick={(e) => e.stopPropagation()}>
                                  Du er satt som flyger/personell på dette oppdraget og kan derfor ikke godkjenne det.
                                </div>
                              )}
                              {approvingMissionId === mission.id ? (
                                <div className="space-y-2 pt-2 border-t border-border/50" onClick={(e) => e.stopPropagation()}>
                                  <Textarea
                                    placeholder="Kommentar (valgfritt)"
                                    value={approvalComment}
                                    onChange={(e) => setApprovalComment(e.target.value)}
                                    rows={2}
                                    className="text-sm"
                                  />
                                  <div className="flex gap-2">
                                    <Button size="sm" onClick={() => handleApproveMission(mission.id)} disabled={selfApprovalBlocked}>
                                      <CheckCircle2 className="h-4 w-4 mr-1" />
                                      Godkjenn
                                    </Button>
                                    <Button size="sm" variant="outline" onClick={() => { setApprovingMissionId(null); setApprovalComment(""); }}>
                                      Avbryt
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Button size="sm" variant="outline" onClick={() => { setCommentingMissionId(commentingMissionId === mission.id ? null : mission.id); setMissionComment(""); }}>
                                    <MessageSquare className="h-4 w-4 mr-1" />
                                    Kommentar
                                  </Button>
                                  <Button size="sm" variant="outline" onClick={() => setApprovingMissionId(mission.id)} disabled={selfApprovalBlocked}>
                                    <CheckCircle2 className="h-4 w-4 mr-1" />
                                    Godkjenn
                                  </Button>
                                </div>
                              )}

                              {/* Display existing comments */}
                              {Array.isArray(mission.approver_comments) && mission.approver_comments.length > 0 && (
                                <div className="pt-2 border-t border-border/50 space-y-1">
                                  {mission.approver_comments.map((c: any, i: number) => (
                                    <p key={i} className="text-xs text-muted-foreground">
                                      <span className="font-medium">Kommentar fra godkjenner {c.author_name}:</span>{' '}
                                      {c.comment}
                                      <span className="ml-1 opacity-60">
                                        ({new Date(c.created_at).toLocaleDateString('no-NO', { day: '2-digit', month: 'short' })})
                                      </span>
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">Ingen oppdrag venter på godkjenning</p>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Follow-up Incidents */}
                <Card>
                  <CardHeader>
                    <CardTitle>Hendelser til oppfølging ({followUpIncidents.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {followUpIncidents.length > 0 ? (
                      <div className="space-y-2">
                        {followUpIncidents.map((incident) => (
                          <div
                            key={incident.id}
                            className="flex justify-between items-center py-2 cursor-pointer hover:bg-accent/50 rounded-md px-2 transition-colors"
                            onClick={() => handleIncidentClick(incident)}
                          >
                            <div className="flex-1">
                              <p className="font-medium">{incident.tittel}</p>
                              <p className="text-xs text-muted-foreground">
                                {incident.status} • {formatDate(incident.hendelsestidspunkt)}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={severityColors[incident.alvorlighetsgrad as keyof typeof severityColors]}
                            >
                              {incident.alvorlighetsgrad}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">{t('profile.noIncidentsFollowUp')}</p>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Subscription Tab */}
              <TabsContent value="subscription" className="space-y-4 mt-20 md:mt-14 lg:mt-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <CreditCard className="h-5 w-5" />
                        Abonnement
                      </CardTitle>
                      <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => { setProfileDialogOpen(false); navigate('/priser'); }}>
                        Se alle planer <ArrowUpRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {stripeExempt ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-primary/10 text-primary border-primary/20">Faktureres separat</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Ditt selskap faktureres separat og trenger ikke Stripe-abonnement.
                        </p>
                      </div>
                    ) : subscriptionLoading ? (
                      <p className="text-sm text-muted-foreground">Sjekker abonnementstatus…</p>
                    ) : subscribed ? (
                      <div className="space-y-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            {isTrial ? (
                              <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/20">Prøveperiode</Badge>
                            ) : cancelAtPeriodEnd ? (
                              <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20">Avsluttes</Badge>
                            ) : (
                              <Badge className="bg-primary/10 text-primary border-primary/20">Aktivt</Badge>
                            )}
                          </div>
                          <span className="text-sm font-medium">
                            {subscriptionPlan
                              ? `${subscriptionPlan.charAt(0).toUpperCase() + subscriptionPlan.slice(1)} – ${
                                  subscriptionPlan === 'starter' ? '99' : subscriptionPlan === 'grower' ? '199' : '299'
                                } NOK/bruker/mnd`
                              : 'AviSafe Platform'}
                            {seatCount > 1 && ` × ${seatCount} brukere`}
                          </span>
                          {subscriptionAddons.length > 0 && (
                            <span className="text-xs text-muted-foreground">
                              Tillegg: {subscriptionAddons.map(a => 
                                a === 'sora_admin' ? 'SORA Admin' : a === 'dji' ? 'DJI' : 'ECCAIRS'
                              ).join(', ')}
                            </span>
                          )}
                        </div>
                        {isTrial && trialEnd && trialEnd !== 'unknown' && (() => {
                          const daysLeft = Math.max(0, Math.ceil((new Date(trialEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                          return (
                            <p className="text-sm text-blue-600 break-words">
                              {daysLeft} {daysLeft === 1 ? 'dag' : 'dager'} igjen av prøveperioden
                              <span className="block text-xs text-blue-500">
                                Utløper {new Date(trialEnd).toLocaleDateString('nb-NO')}
                              </span>
                            </p>
                          );
                        })()}
                        {subscriptionEnd && subscriptionEnd !== 'unknown' && !isTrial && (
                          <p className="text-sm text-muted-foreground">
                            {cancelAtPeriodEnd ? 'Utløper' : 'Neste fornyelse'}: {new Date(subscriptionEnd).toLocaleDateString('nb-NO')}
                          </p>
                        )}
                        {cancelAtPeriodEnd && (
                          <p className="text-xs text-orange-600 break-words">
                            Abonnementet avsluttes ved periodens slutt. Reaktiver via «Administrer abonnement».
                          </p>
                        )}

                        {/* Plan switcher for billing owners */}
                        {isBillingOwner && !cancelAtPeriodEnd && (
                          <>
                            <Separator />
                            <div>
                              <p className="text-sm font-medium mb-2">Bytt plan</p>
                              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                {PLANS.map((plan) => {
                                  const shortFeatures = plan.features.slice(0, 4);
                                  const isCurrent = subscriptionPlan === plan.id;
                                  const isChanging = changingPlan === plan.id;
                                  return (
                                    <button
                                      key={plan.id}
                                      disabled={isCurrent || !!changingPlan}
                                      onClick={async () => {
                                        if (isCurrent || changingPlan) return;
                                        const action = (subscriptionPlan === 'starter' || (subscriptionPlan === 'grower' && plan.id === 'professional'))
                                          ? 'oppgradere' : 'nedgradere';
                                        if (!confirm(`Er du sikker på at du vil ${action} til ${plan.name} (${plan.price} NOK/bruker/mnd)?`)) return;
                                        setChangingPlan(plan.id);
                                        try {
                                          const { data, error } = await supabase.functions.invoke('change-plan', {
                                            body: { new_plan: plan.id },
                                          });
                                          if (error) throw error;
                                          if (data?.error) throw new Error(data.error);
                                          toast.success(`Plan endret til ${plan.name}`);
                                          await checkSubscription();
                                        } catch (e: any) {
                                          toast.error('Kunne ikke endre plan: ' + (e.message || 'Ukjent feil'));
                                        } finally {
                                          setChangingPlan(null);
                                        }
                                      }}
                                      className={`relative p-3 rounded-lg border text-left transition-all ${
                                        isCurrent
                                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                          : 'border-border hover:border-primary/50 hover:bg-accent/50'
                                      } ${changingPlan && !isChanging ? 'opacity-50' : ''}`}
                                    >
                                      {isCurrent && (
                                        <span className="absolute -top-2 left-2 text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-medium">
                                          Nåværende
                                        </span>
                                      )}
                                      <div className="flex items-center justify-between sm:flex-col sm:items-start">
                                        <div>
                                          <p className="text-sm font-semibold">{plan.name}</p>
                                          <p className="text-xs text-muted-foreground">{plan.price} NOK/bruker/mnd</p>
                                        </div>
                                        {isChanging && <Loader2 className="h-4 w-4 animate-spin" />}
                                      </div>
                                      <ul className="mt-1.5 space-y-0.5 hidden sm:block">
                                        {shortFeatures.map(f => (
                                          <li key={f} className="text-[11px] text-muted-foreground">• {f}</li>
                                        ))}
                                      </ul>
                                    </button>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                Endring trer i kraft umiddelbart. Prorata-justering på neste faktura.
                              </p>
                            </div>

                            {/* Addon management */}
                            <Separator />
                            <div>
                              <p className="text-sm font-medium mb-2">Tilleggsmoduler</p>
                              <div className="space-y-2">
                                {([
                                  { id: 'sora_admin', name: 'SORA Admin', desc: 'Avansert SORA risikoanalyse', price: 99 },
                                  { id: 'dji', name: 'DJI-integrasjon', desc: 'Automatisk import av DJI-flightlogs', price: 99 },
                                  { id: 'eccairs', name: 'ECCAIRS-integrasjon', desc: 'E2-rapportering til Luftfartstilsynet', price: 99 },
                                ] as const).map((addon) => {
                                  const isActive = subscriptionAddons.includes(addon.id);
                                  return (
                                    <div
                                      key={addon.id}
                                      className={`flex items-center justify-between p-3 rounded-lg border ${
                                        isActive ? 'border-primary/30 bg-primary/5' : 'border-border'
                                      }`}
                                    >
                                      <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <p className="text-sm font-medium">{addon.name}</p>
                                          {isActive && (
                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Aktiv</Badge>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground break-words">{addon.desc}</p>
                                        <p className="text-xs font-medium mt-0.5">{addon.price} NOK/mnd</p>
                                      </div>
                                      {isBillingOwner && (
                                        <Switch
                                          checked={isActive}
                                          disabled={togglingAddon === addon.id}
                                          onCheckedChange={async (checked) => {
                                            setTogglingAddon(addon.id);
                                            try {
                                              const { data, error } = await supabase.functions.invoke('manage-addon', {
                                                body: { addon_id: addon.id, action: checked ? 'add' : 'remove' },
                                              });
                                              if (error) throw error;
                                              if (data?.error) throw new Error(data.error);
                                              toast.success(checked ? `${addon.name} aktivert` : `${addon.name} deaktivert`);
                                              await checkSubscription();
                                            } catch (e: any) {
                                              toast.error('Kunne ikke oppdatere tilleggsmodul: ' + (e.message || 'Ukjent feil'));
                                            } finally {
                                              setTogglingAddon(null);
                                            }
                                          }}
                                        />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                              <p className="text-xs text-muted-foreground mt-2">
                                {isBillingOwner ? 'Endring trer i kraft umiddelbart med prorata-justering.' : 'Kontakt betalingsansvarlig for å endre tilleggsmoduler.'}
                              </p>
                            </div>
                          </>
                        )}

                        {isBillingOwner && (
                          <Button
                            variant="outline"
                            onClick={async () => {
                              try {
                                const { data, error } = await supabase.functions.invoke('customer-portal');
                                if (error) throw error;
                                if (data?.url) window.open(data.url, '_blank');
                              } catch (e: any) {
                                toast.error('Kunne ikke åpne administrasjon: ' + (e.message || 'Ukjent feil'));
                              }
                            }}
                          >
                            Administrer abonnement
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">Du har ikke et aktivt abonnement.</p>
                        {isBillingOwner || !subscriptionPlan ? (
                          <Button
                            onClick={async () => {
                              try {
                                const { data, error } = await supabase.functions.invoke('create-checkout', {
                                  body: { plan: 'grower', addons: [] },
                                });
                                if (error) throw error;
                                if (data?.url) window.open(data.url, '_blank');
                              } catch (e: any) {
                                toast.error('Kunne ikke starte betaling: ' + (e.message || 'Ukjent feil'));
                              }
                            }}
                          >
                            <CreditCard className="h-4 w-4 mr-2" />
                            Abonner nå
                          </Button>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Kontakt betalingsansvarlig i selskapet for å aktivere abonnement.
                          </p>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          )}
          <p className="text-[10px] text-muted-foreground/50 text-center pt-2 pb-1">
            App versjon v{appVersion}
          </p>
        </ScrollArea>
      </DialogContent>

      {/* Incident Detail Dialog */}
      {selectedIncident && (
        <IncidentDetailDialog
          incident={selectedIncident}
          open={incidentDialogOpen}
          onOpenChange={setIncidentDialogOpen}
          onEditRequest={handleEditIncidentRequest}
        />
      )}

      {/* Edit Incident Dialog */}
      <AddIncidentDialog
        open={editIncidentDialogOpen}
        onOpenChange={(open) => {
          setEditIncidentDialogOpen(open);
          if (!open) {
            setEditingIncident(null);
            fetchUserData();
          }
        }}
        incidentToEdit={editingIncident}
      />

      {/* Competency Dialog */}
      {user && (
        <PersonCompetencyDialog
          open={competencyDialogOpen}
          onOpenChange={setCompetencyDialogOpen}
          person={{ id: user.id, full_name: profile?.full_name || user.email || 'Bruker', personnel_competencies: competencies }}
          onCompetencyUpdated={() => {
            fetchUserData();
          }}
        />
      )}

      {/* Logbook Dialog */}
      {user && (
        <FlightLogbookDialog
          open={logbookDialogOpen}
          onOpenChange={setLogbookDialogOpen}
          personId={user.id}
          personName={profile?.full_name || user.email || 'Bruker'}
        />
      )}

      {/* Mission Detail Dialog */}
      <MissionDetailDialog
        open={missionDetailOpen}
        onOpenChange={setMissionDetailOpen}
        mission={selectedMission}
        onMissionUpdated={fetchUserData}
      />

      {/* Take Course Dialog */}
      {takeCourseAssignmentId && (
        <TakeCourseDialog
          assignmentId={takeCourseAssignmentId}
          open={!!takeCourseAssignmentId}
          onOpenChange={(open) => { if (!open) setTakeCourseAssignmentId(null); }}
          onCompleted={() => {
            setTakeCourseAssignmentId(null);
            setPendingTraining((prev) => prev.filter((t: any) => t.id !== takeCourseAssignmentId));
            fetchUserData();
          }}
        />
      )}
    </Dialog>
  );
};
