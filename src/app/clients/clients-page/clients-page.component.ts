import { Component, ElementRef, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { ClientRecord, ClientFormModel } from '../../app.models';
import { ClientsService } from '../../core/services/clients/clients.service';

@Component({
  selector: 'app-clients-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clients-page.component.html',
  styleUrls: ['./clients-page.component.scss']
})
export class ClientsPageComponent implements OnInit {
  activeView = 'clients';
  clientSearch = '';
  clientCategoryFilter = 'all';
  clientStatusFilter = 'all';
  clientMessage = 'Administra clientes, balances y condiciones comerciales desde una sola vista.';
  openClientOptionsId: number | null = null;
  isClientEditorOpen = false;
  isLoadingClients = false;
  isSavingClient = false;
  clientEditorMode: 'create' | 'edit' = 'create';
  selectedClientId: number | null = null;
  activeMaintenanceLabel = 'Clientes';

  readonly maintenanceLinks = [
    { label: 'Productos', icon: 'box' },
    { label: 'Clientes', icon: 'users' },
    { label: 'Suplidores', icon: 'truck' }
  ];

  get clients(): ClientRecord[] {
    return this.data.clients;
  }

  get selectedClient(): ClientRecord | null {
    return this.data.clients.find((client) => client.id === this.selectedClientId) ?? this.data.clients[0] ?? null;
  }

  clientForm: ClientFormModel = {
    code: '',
    fullName: '',
    companyName: '',
    documentType: 'Cedula',
    documentNumber: '',
    phone: '',
    email: '',
    address: '',
    city: '',
    category: 'Contado',
    creditLimit: 0,
    balance: 0,
    status: 'Activo'
  };

  constructor(
    public data: AppDataService,
    private readonly clientsService: ClientsService,
    private readonly el: ElementRef<HTMLElement>
  ) {}

  focusNextField(event: Event): void {
    event.preventDefault();
    if (!(event.target instanceof HTMLElement)) return;
    const root = this.el.nativeElement;
    const selectors =
      'input:not([readonly]):not([disabled]), select:not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled])';
    const fields = Array.from(root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selectors)).filter(
      (el) =>
        !el.hasAttribute('disabled') &&
        el.getAttribute('readonly') !== 'true' &&
        el.offsetParent !== null &&
        el.getAttribute('tabindex') !== '-1'
    );
    const idx = fields.indexOf(event.target as any);
    if (idx === -1) return;
    const next = fields[idx + 1];
    if (next) {
      next.focus();
      if ('select' in next && typeof (next as any).select === 'function') {
        try {
          (next as HTMLInputElement).select();
        } catch {}
      }
    }
  }

  ngOnInit(): void {
    void this.loadClients();
  }

  get filteredClients(): ClientRecord[] {
    return this.clients.filter((client) => {
      const matchesSearch = !this.clientSearch.trim()
        || [client.code, client.fullName, client.companyName, client.documentNumber]
          .some((value) => value.toLowerCase().includes(this.clientSearch.trim().toLowerCase()));
      const matchesCategory = this.clientCategoryFilter === 'all' || client.category === this.clientCategoryFilter;
      const matchesStatus = this.clientStatusFilter === 'all' || client.status === this.clientStatusFilter;
      return matchesSearch && matchesCategory && matchesStatus;
    });
  }

  isSelectedClient(client: ClientRecord): boolean {
    return this.selectedClient?.id === client.id;
  }

  get totalClientsCount(): number {
    return this.clients.length;
  }

  get activeClientsCount(): number {
    return this.clients.filter((client) => client.status === 'Activo').length;
  }

  get clientsWithBalanceCount(): number {
    return this.clients.filter((client) => client.balance > 0).length;
  }

  get corporateClientsCount(): number {
    return this.clients.filter((client) => client.category === 'Credito').length;
  }

  openClientOptions(clientId: number, event: Event): void {
    event.stopPropagation();
    this.openClientOptionsId = this.openClientOptionsId === clientId ? null : clientId;
  }

  closeClientOptions(): void {
    this.openClientOptionsId = null;
  }

  startCreateClient(): void {
    this.openClientOptionsId = null;
    this.clientEditorMode = 'create';
    this.clientForm = {
      code: '',
      fullName: '',
      companyName: '',
      documentType: 'Cedula',
      documentNumber: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      category: 'Contado',
      creditLimit: 0,
      balance: 0,
      status: 'Activo'
    };
    this.clientMessage = 'Completa los datos para registrar un nuevo cliente.';
    this.isClientEditorOpen = true;
  }

  selectClient(client: ClientRecord): void {
    this.openClientOptionsId = null;
    this.selectedClientId = client.id;
    this.clientMessage = `Cliente seleccionado: ${client.fullName}.`;
  }

  private editClientInternal(client: ClientRecord): void {
    this.openClientOptionsId = null;
    this.loadClientIntoForm(client, 'edit');
    this.clientMessage = `Editando el cliente ${client.fullName}.`;
    this.isClientEditorOpen = true;
  }

  editClientFromOptions(client: ClientRecord, event?: Event): void {
    event?.stopPropagation();
    this.editClientInternal(client);
  }

  closeClientEditor(): void {
    this.isClientEditorOpen = false;
  }

  async saveClient(): Promise<void> {
    if (!this.clientForm.code.trim() || !this.clientForm.fullName.trim() || !this.clientForm.documentNumber.trim()) {
      this.clientMessage = 'Completa codigo, nombre y documento antes de guardar.';
      return;
    }

    this.isSavingClient = true;
    try {
      if (this.clientEditorMode === 'create') {
        const newClient = await this.clientsService.createClient(this.clientForm, this.formatDateOnly());
        this.data.clients = [newClient, ...this.data.clients.filter((client) => client.id !== newClient.id)];
        this.selectedClientId = newClient.id;
        this.loadClientIntoForm(newClient, 'edit');
        this.clientMessage = `Cliente ${newClient.fullName} registrado correctamente.`;
        this.isClientEditorOpen = false;
        return;
      }

      const clientId = this.selectedClientId ?? this.selectedClient?.id;
      if (!clientId) {
        this.clientMessage = 'Selecciona un cliente antes de actualizar.';
        return;
      }

      const updated = await this.clientsService.updateClient(clientId, this.clientForm);
      this.data.clients = this.data.clients.map((client) => client.id === updated.id ? updated : client);
      this.selectedClientId = updated.id;
      this.loadClientIntoForm(updated, 'edit');
      this.clientMessage = `Cliente ${updated.fullName} actualizado correctamente.`;
      this.isClientEditorOpen = false;
    } catch (error) {
      this.clientMessage = this.formatSupabaseError(error, 'No se pudo guardar el cliente.');
    } finally {
      this.isSavingClient = false;
    }
  }

  canDeleteClient(client: ClientRecord): boolean {
    return client.balance === 0;
  }

  async deleteClient(client: ClientRecord): Promise<void> {
    if (!this.canDeleteClient(client)) {
      this.clientMessage = `No se puede eliminar ${client.fullName} porque tiene balance pendiente de RD$${client.balance.toFixed(2)}.`;
      this.openClientOptionsId = null;
      return;
    }

    try {
      await this.clientsService.deleteClient(client.id);
      this.data.clients = this.data.clients.filter((item) => item.id !== client.id);
      this.openClientOptionsId = null;
      const firstRemaining = this.data.clients[0];
      if (firstRemaining) {
        this.selectedClientId = firstRemaining.id;
        this.loadClientIntoForm(firstRemaining, 'edit');
      } else {
        this.selectedClientId = null;
        this.startCreateClient();
      }
      this.clientMessage = `Cliente ${client.fullName} eliminado correctamente.`;
    } catch (error) {
      this.clientMessage = this.formatSupabaseError(error, 'No se pudo eliminar el cliente.');
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeClientOptions();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeClientOptions();
    this.isClientEditorOpen = false;
  }

  private loadClientIntoForm(client: ClientRecord, mode: 'create' | 'edit'): void {
    this.clientEditorMode = mode;
    this.selectedClientId = client.id;
    this.clientForm = {
      code: client.code,
      fullName: client.fullName,
      companyName: client.companyName,
      documentType: client.documentType,
      documentNumber: client.documentNumber,
      phone: client.phone,
      email: client.email,
      address: client.address,
      city: client.city,
      category: client.category,
      creditLimit: client.creditLimit,
      balance: client.balance,
      status: client.status
    };
  }

  private formatDateOnly(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private async loadClients(): Promise<void> {
    this.isLoadingClients = true;
    try {
      const clients = await this.clientsService.getClients();
      this.data.clients = clients;
      const firstClient = clients[0];
      if (firstClient) {
        this.selectedClientId = firstClient.id;
        this.loadClientIntoForm(firstClient, 'edit');
        this.clientMessage = 'Clientes cargados desde Supabase.';
      } else {
        this.selectedClientId = null;
        this.startCreateClient();
        this.clientMessage = 'No hay clientes registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.clientMessage = this.formatSupabaseError(error, 'No se pudieron cargar los clientes desde Supabase.');
    } finally {
      this.isLoadingClients = false;
    }
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }
}
