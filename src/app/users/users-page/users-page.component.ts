import { Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppDataService } from '../../app-data.service';
import { UserRecord, UserFormModel, Company } from '../../app.models';
import { CompaniesService } from '../../core/services/companies/companies.service';
import { UsersService } from '../../core/services/users/users.service';
import { BranchesService } from '../../core/services/branches/branches.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './users-page.component.html',
  styleUrls: ['./users-page.component.scss']
})
export class UsersPageComponent implements OnInit {
  readonly userRoleOptions = [
    'Administrador',
    'Supervisor',
    'Cajero',
    'Contabilidad',
    'Consulta'
  ];

  readonly companyBranches: Record<number, string[]> = {};

  userEditorMode: 'create' | 'edit' = 'create';
  userMessage = 'Formulario listo para registrar un nuevo usuario en el sistema.';
  userMessageType: 'info' | 'success' | 'error' = 'info';
  isLoadingUsers = false;
  isLoadingBranches = false;
  isSavingUser = false;
  selectedUserId: number | null = null;
  openUserOptionsId: number | null = null;
  userForm: UserFormModel = this.createEmptyUserForm();

  constructor(
    public data: AppDataService,
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly branchesService: BranchesService
  ) {}

  ngOnInit(): void {
    void this.loadInitialData();
  }

  async changeUserPassword(user: UserRecord | null): Promise<void> {
    if (!user) return;
    const { value } = await Swal.fire({
      title: 'Cambiar clave',
      html: `<p style="margin:0 0 10px">Nueva clave para <b>${(user.fullName || user.username || '').replace(/[<>&"]/g, '')}</b></p>
        <input id="newPass1" type="password" class="swal2-input" placeholder="Nueva clave (mínimo 6)" autocomplete="new-password">
        <input id="newPass2" type="password" class="swal2-input" placeholder="Repite la clave" autocomplete="new-password">`,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Guardar clave',
      cancelButtonText: 'Cancelar',
      didOpen: () => (document.getElementById('newPass1') as HTMLInputElement | null)?.focus(),
      preConfirm: () => {
        const a = (document.getElementById('newPass1') as HTMLInputElement).value;
        const b = (document.getElementById('newPass2') as HTMLInputElement).value;
        if (a.length < 6) { Swal.showValidationMessage('La clave debe tener al menos 6 caracteres.'); return false; }
        if (a !== b) { Swal.showValidationMessage('Las dos claves no coinciden.'); return false; }
        return a;
      }
    });
    if (!value) return;
    try {
      await this.usersService.changePassword(user.id, value as string);
      await Swal.fire({ icon: 'success', title: 'Clave cambiada', text: `${user.fullName || user.username} ya puede entrar con la clave nueva.`, timer: 2500, showConfirmButton: false });
    } catch (error) {
      await Swal.fire({ icon: 'error', title: 'No se pudo cambiar la clave', text: error instanceof Error ? error.message : String(error) });
    }
  }

  get selectedUser(): UserRecord | null {
    return this.data.users.find((user) => user.id === this.selectedUserId) ?? this.data.users[0] ?? null;
  }

  get activeUserCount(): number {
    return this.data.users.filter((user) => user.status === 'Activo').length;
  }

  get inactiveUserCount(): number {
    return this.data.users.filter((user) => user.status === 'Inactivo').length;
  }

  get canSaveUser(): boolean {
    const { firstName, lastName, username, password, confirmPassword, email, companyId, branch, role } = this.userForm;
    const hasRequiredData = Boolean(
      firstName.trim() && lastName.trim() && username.trim() && email.trim() && companyId && branch && role
    );

    return hasRequiredData && (this.userEditorMode === 'edit' || (password.length >= 6 && password === confirmPassword));
  }

  get passwordMismatch(): boolean {
    return Boolean(this.userForm.confirmPassword) && this.userForm.password !== this.userForm.confirmPassword;
  }

  get availableBranches(): string[] {
    if (!this.userForm.companyId) {
      return [];
    }

    return this.companyBranches[this.userForm.companyId] ?? [];
  }

  isSelectedUser(user: UserRecord): boolean {
    return this.selectedUser?.id === user.id && this.userEditorMode === 'edit';
  }

  onUserCompanyChange(): void {
    if (!this.userForm.companyId) {
      this.userForm.branch = '';
      return;
    }
    this.userForm.branch = '';
    void this.loadBranchesForCompany(this.userForm.companyId);
  }

  normalizeUsername(): void {
    this.userForm.username = this.userForm.username.trim().toUpperCase().replace(/\s+/g, '');
  }

  async saveUser(): Promise<void> {
    this.normalizeUsername();
    const { firstName, lastName, username, password, confirmPassword, email, companyId, branch, role } = this.userForm;

    if (!firstName.trim() || !lastName.trim() || !username.trim() || !email.trim() || !companyId || !branch || !role) {
      const missingFields: string[] = [];
      if (!firstName.trim() || !lastName.trim()) missingFields.push('nombre y apellido');
      if (!username.trim()) missingFields.push('ID de usuario');
      if (!email.trim()) missingFields.push('correo de contacto');
      if (!companyId) missingFields.push('empresa');
      if (!branch) missingFields.push('sucursal');
      if (!role) missingFields.push('rol');
      this.setUserMessage(`Completa los campos obligatorios: ${missingFields.join(', ')}.`, 'error');
      return;
    }

    if (!/^[A-Z0-9._-]+$/.test(username)) {
      this.setUserMessage('El ID de usuario solo puede contener letras, numeros, punto, guion y guion bajo.', 'error');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      this.setUserMessage('Escribe un correo de contacto valido.', 'error');
      return;
    }

    if (this.userEditorMode === 'create' && password.length < 6) {
      this.setUserMessage('La clave debe tener al menos 6 caracteres.', 'error');
      return;
    }

    if (this.userEditorMode === 'create' && password !== confirmPassword) {
      this.setUserMessage('La confirmacion de la clave no coincide.', 'error');
      return;
    }

    this.isSavingUser = true;
    try {
      const lastUpdate = this.formatTimestamp();
      if (this.userEditorMode === 'create') {
        const newUser = await this.usersService.createUser(this.userForm, lastUpdate);
        this.data.users = [newUser, ...this.data.users.filter((user) => user.id !== newUser.id)];
        this.selectedUserId = newUser.id;
        this.loadUserIntoForm(newUser, 'edit');
        this.setUserMessage(`Usuario ${newUser.fullName} creado correctamente con rol ${newUser.role}.`, 'success');
        return;
      }

      const userId = this.selectedUserId ?? this.selectedUser?.id;
      if (!userId) {
        this.setUserMessage('Selecciona un usuario antes de actualizar.', 'error');
        return;
      }

      const updatedUser = await this.usersService.updateUser(userId, this.userForm, lastUpdate);
      this.data.users = this.data.users.map((user) => user.id === updatedUser.id ? updatedUser : user);
      this.selectedUserId = updatedUser.id;
      this.loadUserIntoForm(updatedUser, 'edit');
      this.setUserMessage(`Usuario ${updatedUser.fullName} actualizado correctamente.`, 'success');
    } catch (error) {
      this.setUserMessage(this.formatSupabaseError(error, 'No se pudo guardar el usuario.'), 'error');
    } finally {
      this.isSavingUser = false;
    }
  }

  resetUserForm(): void {
    this.userForm = this.createEmptyUserForm();
    this.userEditorMode = 'create';
    this.setUserMessage('Completa los datos para agregar un nuevo usuario.');
  }

  private setUserMessage(message: string, type: 'info' | 'success' | 'error' = 'info'): void {
    this.userMessage = message;
    this.userMessageType = type;
  }

  selectUser(user: UserRecord): void {
    this.selectedUserId = user.id;
    this.loadUserIntoForm(user, 'edit');
    this.userMessage = `Editando al usuario ${user.fullName}.`;
    this.openUserOptionsId = null;
    if (user.companyId) {
      void this.loadBranchesForCompany(user.companyId);
    }
  }

  startCreateUser(): void {
    this.resetUserForm();
  }

  toggleSelectedUserStatus(): void {
    const selectedUser = this.selectedUser;
    if (!selectedUser) {
      this.userMessage = 'No hay un usuario seleccionado para cambiar estado.';
      return;
    }

    this.userForm.status = selectedUser.status === 'Activo' ? 'Inactivo' : 'Activo';
    void this.saveUser();
  }

  async deleteUser(user: UserRecord): Promise<void> {
    try {
      await this.usersService.deleteUser(user.id);
      this.data.users = this.data.users.filter((item) => item.id !== user.id);
      this.openUserOptionsId = null;
      const remaining = this.data.users[0];
      if (remaining) {
        this.selectedUserId = remaining.id;
        this.loadUserIntoForm(remaining, 'edit');
      } else {
        this.selectedUserId = null;
        this.startCreateUser();
      }
      this.userMessage = `Usuario ${user.fullName} eliminado correctamente.`;
    } catch (error) {
      this.userMessage = this.formatSupabaseError(error, 'No se pudo eliminar el usuario.');
    }
  }

  toggleUserOptions(userId: number, event: Event): void {
    event.stopPropagation();
    this.openUserOptionsId = this.openUserOptionsId === userId ? null : userId;
  }

  getCompanyName(companyId: number | null): string {
    if (!companyId) {
      return 'Sin empresa';
    }

    return this.data.companies.find((company: Company) => company.id === companyId)?.tradeName ?? 'Sin empresa';
  }

  private loadUserIntoForm(user: UserRecord, mode: 'create' | 'edit'): void {
    this.userEditorMode = mode;
    this.selectedUserId = user.id;
    this.userForm = {
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      password: '',
      confirmPassword: '',
      email: user.email,
      phone: user.phone,
      companyId: user.companyId,
      branch: user.branch,
      role: user.role,
      status: user.status
    };
  }

  private createEmptyUserForm(): UserFormModel {
    return {
      firstName: '',
      lastName: '',
      username: '',
      password: '',
      confirmPassword: '',
      email: '',
      phone: '',
      companyId: null,
      branch: '',
      role: '',
      status: 'Activo'
    };
  }

  private async loadInitialData(): Promise<void> {
    this.isLoadingUsers = true;
    try {
      const [users, companies] = await Promise.all([
        this.usersService.getUsers(),
        this.companiesService.getCompanies()
      ]);
      this.data.users = users;
      this.data.companies = companies;
      const firstUser = users[0];
      if (firstUser) {
        this.selectedUserId = firstUser.id;
        this.loadUserIntoForm(firstUser, 'edit');
        this.userMessage = 'Usuarios cargados desde Supabase.';
        if (firstUser.companyId) {
          await this.loadBranchesForCompany(firstUser.companyId);
        }
      } else {
        this.selectedUserId = null;
        this.startCreateUser();
        this.userMessage = 'No hay usuarios registrados. Puedes crear el primero.';
      }
    } catch (error) {
      this.data.users = [];
      this.selectedUserId = null;
      this.startCreateUser();
      this.userMessage = this.formatSupabaseError(error, 'No se pudieron cargar los usuarios desde Supabase.');
    } finally {
      this.isLoadingUsers = false;
    }
  }

  private formatTimestamp(): string {
    return new Intl.DateTimeFormat('es-DO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Santo_Domingo'
    }).format(new Date());
  }

  private async loadBranchesForCompany(companyId: number): Promise<void> {
    this.isLoadingBranches = true;
    try {
      const branches = await this.branchesService.getBranches(companyId);
      this.companyBranches[companyId] = branches
        .filter((branch) => branch.status === 'Activa')
        .map((branch) => branch.name);
      if (this.userForm.companyId === companyId && !this.companyBranches[companyId].includes(this.userForm.branch)) {
        this.userForm.branch = '';
      }
    } catch (error) {
      this.companyBranches[companyId] = [];
      this.userMessage = this.formatSupabaseError(error, 'No se pudieron cargar las sucursales reales de la empresa.');
    } finally {
      this.isLoadingBranches = false;
    }
  }

  private formatSupabaseError(error: unknown, fallback: string): string {
    if (error && typeof error === 'object' && 'message' in error) {
      return `${fallback} ${(error as { message?: string }).message ?? ''}`.trim();
    }
    return fallback;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.openUserOptionsId = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.openUserOptionsId = null;
  }
}
