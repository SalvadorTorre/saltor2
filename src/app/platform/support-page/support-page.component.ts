import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  PlatformCompany, PlatformService, SupportTicket, TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATES, TicketMessage, TicketState
} from '../../core/services/platform/platform.service';

/**
 * Soporte. Los usuarios de una empresa abren tickets y conversan con SaltorSystem
 * (/configuracion/soporte); el dueño del sistema ve y atiende los de todas las empresas
 * (/plataforma/soporte, con platform = true).
 */
@Component({
  selector: 'app-support-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './support-page.component.html',
  styleUrls: ['./support-page.component.scss']
})
export class SupportPageComponent implements OnInit {
  @Input() platform = false;
  @Input() empresa?: string;

  readonly categories = TICKET_CATEGORIES;
  readonly priorities = TICKET_PRIORITIES;
  readonly states = TICKET_STATES;

  tickets: SupportTicket[] = [];
  companies: PlatformCompany[] = [];
  companyId: number | null = null;
  view: 'abiertos' | 'responder' | 'todos' = 'abiertos';
  isLoading = false;
  errorMessage = '';

  selected: SupportTicket | null = null;
  messages: TicketMessage[] = [];
  reply = '';
  isSending = false;

  draft: { asunto: string; categoria: string; prioridad: string; mensaje: string; empresa_id: number | null } | null = null;

  constructor(private readonly platformService: PlatformService) {}

  async ngOnInit(): Promise<void> {
    this.companyId = this.empresa ? Number(this.empresa) || null : null;
    if (this.platform) {
      this.view = 'responder';
      try { this.companies = (await this.platformService.getSummary()).empresas; } catch { /* sin nombres */ }
    }
    await this.load();
  }

  async load(): Promise<void> {
    this.isLoading = true;
    this.errorMessage = '';
    try {
      this.tickets = await this.platformService.getTickets();
      if (this.selected) this.selected = this.tickets.find((t) => t.id === this.selected?.id) ?? null;
    } catch (error) {
      const message = this.message(error);
      this.errorMessage = /plataforma_tickets/.test(message) ? 'Falta aplicar la migración de la fase 3 de la plataforma.' : message;
    } finally { this.isLoading = false; }
  }

  get visible(): SupportTicket[] {
    return this.tickets.filter((t) => {
      if (this.companyId && t.empresa_id !== this.companyId) return false;
      const open = !['Resuelto', 'Cerrado'].includes(t.estado);
      if (this.view === 'abiertos') return open;
      if (this.view === 'responder') return open && this.needsAnswer(t);
      return true;
    });
  }

  get pendingCount(): number { return this.tickets.filter((t) => !['Resuelto', 'Cerrado'].includes(t.estado) && this.needsAnswer(t)).length; }
  get openCount(): number { return this.tickets.filter((t) => !['Resuelto', 'Cerrado'].includes(t.estado)).length; }

  /** Soporte debe responder cuando el último mensaje es del cliente; el cliente, cuando es de soporte. */
  needsAnswer(t: SupportTicket): boolean { return this.platform ? t.ultimo_autor === 'Cliente' : t.ultimo_autor === 'Soporte'; }

  companyName(id: number): string { return this.companies.find((c) => c.id === id)?.nombre_comercial ?? ''; }

  stateClass(state: string): string {
    return ({ Abierto: 'is-warn', 'En proceso': 'is-trial', 'Esperando cliente': 'is-grace', Resuelto: 'is-ok', Cerrado: 'is-off' } as Record<string, string>)[state] ?? '';
  }
  priorityClass(p: string): string { return ({ Urgente: 'is-bad', Alta: 'is-grace', Normal: '', Baja: 'is-off' } as Record<string, string>)[p] ?? ''; }

  async open(t: SupportTicket): Promise<void> {
    this.selected = t;
    this.draft = null;
    this.reply = '';
    try { this.messages = await this.platformService.getTicketMessages(t.id); }
    catch (error) { this.errorMessage = this.message(error); }
  }

  newTicket(): void {
    this.selected = null;
    this.draft = { asunto: '', categoria: 'Consulta', prioridad: 'Normal', mensaje: '', empresa_id: this.companyId };
  }

  async createTicket(): Promise<void> {
    const d = this.draft;
    if (!d) return;
    if (!d.asunto.trim() || !d.mensaje.trim()) { this.errorMessage = 'Escribe el asunto y describe el caso.'; return; }
    if (this.platform && !d.empresa_id) { this.errorMessage = 'Elige la empresa.'; return; }
    this.isSending = true;
    this.errorMessage = '';
    try {
      const created = await this.platformService.createTicket(d);
      this.draft = null;
      await this.load();
      const fresh = this.tickets.find((t) => t.id === created.id);
      if (fresh) await this.open(fresh);
      void Swal.fire({ icon: 'success', title: `Ticket ${created.numero} enviado`, text: this.platform ? '' : 'SaltorSystem te responderá por aquí.', timer: 2200, showConfirmButton: false });
    } catch (error) { this.errorMessage = this.message(error); }
    finally { this.isSending = false; }
  }

  async send(): Promise<void> {
    if (!this.selected || !this.reply.trim()) return;
    this.isSending = true;
    try {
      await this.platformService.addTicketMessage(this.selected.id, this.reply);
      this.reply = '';
      await this.load();
      if (this.selected) await this.open(this.selected);
    } catch (error) { this.errorMessage = this.message(error); }
    finally { this.isSending = false; }
  }

  async setState(state: TicketState): Promise<void> {
    if (!this.selected) return;
    try {
      await this.platformService.updateTicket(this.selected.id, { estado: state });
      await this.load();
    } catch (error) { this.errorMessage = this.message(error); }
  }

  async setPriority(priority: string): Promise<void> {
    if (!this.selected) return;
    try { await this.platformService.updateTicket(this.selected.id, { prioridad: priority }); await this.load(); }
    catch (error) { this.errorMessage = this.message(error); }
  }

  private message(error: unknown): string { return String((error as { message?: string })?.message ?? error ?? 'Error'); }
}
