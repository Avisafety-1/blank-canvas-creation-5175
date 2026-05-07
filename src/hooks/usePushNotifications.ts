import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// VAPID public key - this should match the one in your edge function secrets
const VAPID_PUBLIC_KEY = 'BD9yHkTYW7JVOnMJ15jtV7ef6Cfhgw0L4pbhA6Bwx3tzPm37B_FYlzzFfpQY5jxE-pMIAS2fx2HAv9nYUm6eW4U';

interface PushSubscriptionData {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function usePushNotifications() {
  const { user } = useAuth();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  // Check if push notifications are supported
  useEffect(() => {
    const checkSupport = async () => {
      const supported = 'serviceWorker' in navigator && 
                       'PushManager' in window && 
                       'Notification' in window;
      setIsSupported(supported);
      
      if (supported) {
        setPermission(Notification.permission);
      }
      
      setIsLoading(false);
    };
    
    checkSupport();
  }, []);

  // Check if user is already subscribed
  useEffect(() => {
    const checkSubscription = async () => {
      if (!isSupported || !user) {
        setIsSubscribed(false);
        return;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        setIsSubscribed(!!subscription);
      } catch (error) {
        console.error('Error checking subscription:', error);
        setIsSubscribed(false);
      }
    };

    checkSubscription();
  }, [isSupported, user]);

  // Convert VAPID key to Uint8Array
  const urlBase64ToUint8Array = useCallback((base64String: string) => {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }, []);

  // Request permission and subscribe
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user) {
      toast.error('Push-varsler støttes ikke på denne enheten');
      return false;
    }

    // Check iOS and PWA status
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isPWA = window.matchMedia('(display-mode: standalone)').matches 
               || (window.navigator as any).standalone === true;

    if (isIOS && !isPWA) {
      toast.error('På iOS må appen være lagt til hjemskjermen. Gå til Del-menyen og velg "Legg til på Hjem-skjerm".');
      return false;
    }

    try {
      setIsLoading(true);

      // Request permission
      const permissionResult = await Notification.requestPermission();
      setPermission(permissionResult);
      
      if (permissionResult !== 'granted') {
        toast.error('Du må tillate varsler for å aktivere push-varsler');
        return false;
      }

      // Use the unified service worker registered by Vite PWA plugin
      const registration = await navigator.serviceWorker.ready;
      console.log('Using unified service worker:', registration.scope);

      // ALWAYS delete existing subscription first to ensure new VAPID keys are used
      const existingSubscription = await registration.pushManager.getSubscription();
      if (existingSubscription) {
        console.log('Removing existing push subscription to refresh VAPID keys...');
        await existingSubscription.unsubscribe();
      }

      // Create new subscription with current VAPID keys
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      console.log('New push subscription created:', subscription.endpoint);

      // Extract subscription data
      const subscriptionJson = subscription.toJSON();
      const subscriptionData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        p256dh: subscriptionJson.keys?.p256dh || '',
        auth: subscriptionJson.keys?.auth || ''
      };

      // Get user's company_id
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('id', user.id)
        .single();

      if (!profile?.company_id) {
        toast.error('Kunne ikke finne firmaet ditt');
        return false;
      }

      // Save subscription to database
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          company_id: profile.company_id,
          endpoint: subscriptionData.endpoint,
          p256dh: subscriptionData.p256dh,
          auth: subscriptionData.auth,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id,endpoint'
        });

      if (error) {
        console.error('Error saving subscription:', error);
        toast.error('Kunne ikke lagre push-abonnement');
        return false;
      }

      // Update notification preferences
      await supabase
        .from('notification_preferences')
        .update({ push_enabled: true })
        .eq('user_id', user.id);

      setIsSubscribed(true);
      toast.success('Push-varsler aktivert!');
      return true;
    } catch (error) {
      console.error('Error subscribing to push:', error);
      
      if (error instanceof DOMException) {
        if (error.name === 'NotAllowedError') {
          toast.error('Tilgang til push-varsler ble avvist av nettleseren');
        } else if (error.name === 'AbortError') {
          toast.error('Push-registrering ble avbrutt');
        } else {
          toast.error(`Push-feil: ${error.name} - ${error.message}`);
        }
      } else {
        toast.error('Kunne ikke aktivere push-varsler. Sjekk konsollen for detaljer.');
      }
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, urlBase64ToUint8Array]);

  // Unsubscribe
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!user) return false;

    try {
      setIsLoading(true);

      // Get current subscription
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        // Unsubscribe from push
        await subscription.unsubscribe();

        // Remove from database
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('endpoint', subscription.endpoint);
      }

      // Update notification preferences
      await supabase
        .from('notification_preferences')
        .update({ push_enabled: false })
        .eq('user_id', user.id);

      setIsSubscribed(false);
      toast.success('Push-varsler deaktivert');
      return true;
    } catch (error) {
      console.error('Error unsubscribing from push:', error);
      toast.error('Kunne ikke deaktivere push-varsler');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Send test notification
  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    if (!user || !isSubscribed) {
      toast.error('Du må først aktivere push-varsler');
      return false;
    }

    try {
      const { error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          userId: user.id,
          title: 'Test fra AviSafe',
          body: 'Dette er en test-varsling. Push-varsler fungerer!',
          url: '/',
          tag: 'test-notification'
        }
      });

      if (error) {
        console.error('Error sending test notification:', error);
        toast.error('Kunne ikke sende test-varsling');
        return false;
      }

      toast.success('Test-varsling sendt!');
      return true;
    } catch (error) {
      console.error('Error sending test notification:', error);
      toast.error('Kunne ikke sende test-varsling');
      return false;
    }
  }, [user, isSubscribed]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
    sendTestNotification
  };
}
