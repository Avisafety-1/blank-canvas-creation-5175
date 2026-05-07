import L from "leaflet";
import { supabase } from "@/integrations/supabase/client";

export async function showWeatherPopup(map: L.Map, lat: number, lng: number) {
  const popup = L.popup()
    .setLatLng([lat, lng])
    .setContent(`
      <div style="min-width: 280px; padding: 8px;">
        <div style="font-weight: 600; margin-bottom: 8px; font-size: 14px;">
          Dronevær for valgt posisjon
        </div>
        <div style="font-size: 12px; color: #666; margin-bottom: 12px;">
          Koordinater: ${lat.toFixed(4)}, ${lng.toFixed(4)}
        </div>
        <div id="weather-content-${Date.now()}" style="text-align: center; padding: 12px;">
          <div style="display: inline-block; width: 16px; height: 16px; border: 2px solid #3b82f6; border-top-color: transparent; border-radius: 50%; animation: spin 1s linear infinite;"></div>
          <div style="margin-top: 8px; font-size: 12px; color: #666;">Laster værdata...</div>
        </div>
        <style>
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        </style>
      </div>
    `)
    .openOn(map);
  
  try {
    const { data, error } = await supabase.functions.invoke('drone-weather', {
      body: { lat, lon: lng }
    });
    
    const contentEl = document.querySelector(`[id^="weather-content-"]`) as HTMLElement;
    if (!contentEl) return;
    
    if (error || !data) {
      contentEl.innerHTML = '<div style="color: #dc2626; padding: 8px;">Kunne ikke hente værdata</div>';
      return;
    }
    
    const recommendation = data.drone_flight_recommendation;
    const recommendationColors: Record<string, any> = {
      warning: { bg: '#fee2e2', border: '#dc2626', color: '#dc2626' },
      caution: { bg: '#fef3c7', border: '#f59e0b', color: '#f59e0b' },
      ok: { bg: '#d1fae5', border: '#10b981', color: '#10b981' },
    };
    const colors = recommendationColors[recommendation] || { bg: '#f3f4f6', border: '#9ca3af', color: '#6b7280' };
    
    const recommendationText: Record<string, string> = {
      warning: 'Anbefales ikke å fly',
      caution: 'Fly med forsiktighet',
      ok: 'Gode flyforhold',
    };
    
    let html = `
      <div style="padding: 8px; background: ${colors.bg}; border: 1px solid ${colors.border}; border-radius: 6px; margin-bottom: 12px;">
        <div style="color: ${colors.color}; font-weight: 600; font-size: 13px;">
          ${recommendationText[recommendation] || 'Ukjent'}
        </div>
      </div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 12px; margin-bottom: 12px;">
        <div>
          <div style="color: #6b7280; font-size: 11px;">Vind</div>
          <div style="font-weight: 600;">${data.current.wind_speed?.toFixed(1) || '-'} m/s</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 11px;">Temp</div>
          <div style="font-weight: 600;">${data.current.temperature?.toFixed(1) || '-'}°C</div>
        </div>
        <div>
          <div style="color: #6b7280; font-size: 11px;">Nedbør</div>
          <div style="font-weight: 600;">${data.current.precipitation?.toFixed(1) || '0'} mm</div>
        </div>
        ${data.current.dew_point != null ? `
        <div>
          <div style="color: #6b7280; font-size: 11px;">Duggpunkt</div>
          <div style="font-weight: 600;">${data.current.dew_point.toFixed(1)}°C</div>
        </div>
        ` : ''}
      </div>
    `;
    
    if (data.warnings && data.warnings.length > 0) {
      html += '<div style="margin-top: 12px; font-size: 11px;">';
      data.warnings.forEach((w: any) => {
        const wColors: Record<string, any> = {
          warning: { bg: '#fee2e2', border: '#dc2626' },
          caution: { bg: '#fef3c7', border: '#f59e0b' },
          note: { bg: '#dbeafe', border: '#3b82f6' },
        };
        const wColor = wColors[w.level] || wColors.note;
        html += `<div style="padding: 6px; background: ${wColor.bg}; border-left: 3px solid ${wColor.border}; margin-bottom: 6px; border-radius: 3px;">${w.message}</div>`;
      });
      html += '</div>';
    }
    
    // Timeprognose for de neste 12 timene
    if (data.hourly_forecast && data.hourly_forecast.length > 0) {
      const forecast = data.hourly_forecast.slice(0, 12);
      const recColors: Record<string, string> = {
        ok: '#10b981',
        caution: '#f59e0b',
        warning: '#dc2626',
      };
      const recTexts: Record<string, string> = {
        ok: 'Gode flyforhold',
        caution: 'Fly med forsiktighet',
        warning: 'Anbefales ikke å fly',
      };
      
      const getReasons = (h: any) => {
        const reasons: string[] = [];
        const windSpeed = h.wind_speed || 0;
        const windGust = h.wind_gust || 0;
        const precipitation = h.precipitation || 0;
        const temperature = h.temperature || 0;
        const symbol = h.symbol || '';
        
        if (windSpeed > 10) reasons.push(`Sterk vind (${windSpeed.toFixed(1)} m/s)`);
        if (windGust > 15) reasons.push(`Kraftige vindkast (${windGust.toFixed(1)} m/s)`);
        if (precipitation > 2) reasons.push(`Kraftig nedbør (${precipitation.toFixed(1)} mm)`);
        if (temperature < -10 || temperature > 40) reasons.push(`Ekstrem temperatur (${temperature.toFixed(0)}°C)`);
        if (symbol.includes('fog')) reasons.push('Tåke');
        
        if (reasons.length === 0) {
          if (windSpeed > 7) reasons.push(`Mye vind (${windSpeed.toFixed(1)} m/s)`);
          if (windGust > 10) reasons.push(`Vindkast (${windGust.toFixed(1)} m/s)`);
          if (precipitation > 0.5) reasons.push(`Nedbør (${precipitation.toFixed(1)} mm)`);
          if (temperature < 0) reasons.push(`Kulde (${temperature.toFixed(0)}°C)`);
        }
        return reasons;
      };
      
      const popupId = `forecast-popup-${Date.now()}`;
      
      const forecastDataId = `forecastData_${Date.now()}`;
      (window as any)[forecastDataId] = forecast.map((h: any, i: number) => {
        const hour = new Date(h.time).getHours().toString().padStart(2, '0');
        const reasons = getReasons(h);
        return {
          hour,
          temp: h.temperature?.toFixed(1) || '-',
          wind: h.wind_speed?.toFixed(1) || '-',
          windGust: h.wind_gust?.toFixed(1) || null,
          precip: h.precipitation?.toFixed(1) || '0',
          recommendation: h.recommendation,
          recText: recTexts[h.recommendation] || '',
          color: recColors[h.recommendation] || '#9ca3af',
          reasons,
        };
      });
      
      html += `
        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #e5e7eb;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 8px;">
            <div style="font-size: 11px; font-weight: 600; color: #6b7280; line-height: 1.3;">Prognose neste<br/>12 timer</div>
            <div style="display: flex; gap: 6px; font-size: 9px; color: #9ca3af;">
              <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #10b981; border-radius: 2px;"></span>OK</span>
              <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #f59e0b; border-radius: 2px;"></span>Forsiktig</span>
              <span style="display: flex; align-items: center; gap: 2px;"><span style="width: 8px; height: 8px; background: #dc2626; border-radius: 2px;"></span>Ikke fly</span>
            </div>
          </div>
          <div id="${popupId}-container" style="display: flex; gap: 2px; position: relative;">
            ${forecast.map((h: any, i: number) => {
              const hour = new Date(h.time).getHours().toString().padStart(2, '0');
              const color = recColors[h.recommendation] || '#9ca3af';
              return `
                <div 
                  class="forecast-block-${popupId}" 
                  data-index="${i}"
                  data-forecast-id="${forecastDataId}"
                  data-popup-id="${popupId}"
                  style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; cursor: pointer; position: relative;"
                >
                  <div style="width: 100%; height: 16px; background: ${color}; border-radius: 3px; transition: transform 0.1s;" onmouseover="this.style.transform='scaleY(1.2)'" onmouseout="this.style.transform='scaleY(1)'"></div>
                  <span style="font-size: 8px; color: #9ca3af;">${hour}</span>
                </div>
              `;
            }).join('')}
            <div id="${popupId}" style="display: none; position: absolute; z-index: 9999; pointer-events: auto;"></div>
          </div>
        </div>
      `;
      
      // Beste flyvindu
      if (data.best_flight_window) {
        const startTime = new Date(data.best_flight_window.start_time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
        const endTime = new Date(data.best_flight_window.end_time).toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
        html += `
          <div style="margin-top: 8px; display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 500;">
            <span style="color: #10b981;">✨</span>
            <span>Beste flyvindu: ${startTime} - ${endTime} (${data.best_flight_window.duration_hours}t)</span>
          </div>
        `;
      }
      
      // Legg til event listeners etter HTML er satt
      setTimeout(() => {
        const blocks = document.querySelectorAll(`.forecast-block-${popupId}`);
        blocks.forEach((block) => {
          block.addEventListener('click', function(this: HTMLElement) {
            const idx = parseInt(this.dataset.index || '0');
            const dataId = this.dataset.forecastId || '';
            const popId = this.dataset.popupId || '';
            const forecastArr = (window as any)[dataId];
            if (!forecastArr) return;
            
            const h = forecastArr[idx];
            const popupEl = document.getElementById(popId);
            if (!popupEl) return;
            
            if (popupEl.style.display === 'block' && popupEl.dataset.activeIndex === String(idx)) {
              popupEl.style.display = 'none';
              return;
            }
            
            let reasonsHtml = '';
            if (h.recommendation !== 'ok' && h.reasons.length > 0) {
              reasonsHtml = `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: ${h.color}; font-size: 10px; font-weight: 500;">${h.recText}<ul style="margin: 4px 0 0 14px; padding: 0; font-weight: 400;">${h.reasons.map((r: string) => `<li style="margin-bottom: 2px;">${r}</li>`).join('')}</ul></div>`;
            } else if (h.recommendation === 'ok') {
              reasonsHtml = `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e5e7eb; color: #10b981; font-size: 10px; font-weight: 500;">Gode flyforhold</div>`;
            }
            
            popupEl.innerHTML = `
              <div style="padding: 10px; background: white; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-size: 12px; min-width: 160px; border: 1px solid #e5e7eb;">
                <div style="font-weight: 600; margin-bottom: 8px; font-size: 13px;">${h.hour}:00</div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span>🌡️</span><span>${h.temp}°C</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 4px;">
                  <span>💨</span><span>${h.wind} m/s${h.windGust ? ` (kast ${h.windGust})` : ''}</span>
                </div>
                <div style="display: flex; align-items: center; gap: 6px;">
                  <span>💧</span><span>${h.precip} mm</span>
                </div>
                ${reasonsHtml}
              </div>
            `;
            popupEl.dataset.activeIndex = String(idx);
            popupEl.style.display = 'block';
            
            const blockRect = this.getBoundingClientRect();
            const container = document.getElementById(`${popId}-container`);
            if (container) {
              const containerRect = container.getBoundingClientRect();
              const popupWidth = 160;
              let leftPos = blockRect.left - containerRect.left + blockRect.width / 2 - popupWidth / 2;
              
              if (leftPos < 0) leftPos = 0;
              if (leftPos + popupWidth > containerRect.width) leftPos = containerRect.width - popupWidth;
              
              popupEl.style.left = `${leftPos}px`;
              popupEl.style.bottom = `calc(100% + 4px)`;
              popupEl.style.transform = 'none';
            }
          });
        });
      }, 100);
    }
    
    html += '<div style="margin-top: 12px; font-size: 10px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding-top: 8px;">Værdata fra MET Norway</div>';
    
    contentEl.innerHTML = html;
  } catch (err) {
    console.error('Error fetching weather in map popup:', err);
    const contentEl = document.querySelector(`[id^="weather-content-"]`) as HTMLElement;
    if (contentEl) {
      contentEl.innerHTML = '<div style="color: #dc2626; padding: 8px;">Feil ved henting av værdata</div>';
    }
  }
}
