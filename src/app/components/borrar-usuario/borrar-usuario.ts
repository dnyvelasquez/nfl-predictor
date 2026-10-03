import { Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService, ROLES, Rol, UsuarioVisible } from '../../services/auth/auth';
import { GruposService, Grupo } from '../../services/grupos';
import { Router, RouterModule } from '@angular/router';
import { forkJoin } from 'rxjs';

const POR_PAGINA = 20;

@Component({
  selector: 'app-borrar-usuario',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    RouterModule
  ],
  templateUrl: './borrar-usuario.html',
  styleUrls: ['./borrar-usuario.css']
})
export class BorrarUsuario implements OnInit {

  private svc = inject(AuthService);
  private gruposService = inject(GruposService);
  private fb = inject(FormBuilder);
  private router = inject(Router);

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;

  page = 1;
  q = '';

  private todos: UsuarioVisible[] = [];
  users: UsuarioVisible[] = [];
  hayMas = false;

  roles = ROLES;
  grupos: Grupo[] = [];
  // El usuario en sesión no puede cambiarse el rol ni borrarse (evita quedarse sin super usuario).
  miUserId: string | null = null;

  search = this.fb.control('');
  nuevoGrupo = this.fb.control('', [Validators.required, Validators.minLength(2)]);

  ngOnInit(): void {
    this.svc.getUserId$().subscribe((id) => this.miUserId = id);
    this.load();
  }

  load() {
    this.loading = true;
    this.errorMsg = null;
    forkJoin({ usuarios: this.svc.listUsers(), grupos: this.gruposService.getGrupos() }).subscribe({
      next: ({ usuarios, grupos }) => {
        this.todos = usuarios;
        this.grupos = grupos;
        this.paginar();
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'Error cargando usuarios';
        this.loading = false;
      },
    });
  }

  private paginar() {
    const query = this.q.toLowerCase();
    const filtrados = query ? this.todos.filter((u) => u.email?.toLowerCase().includes(query)) : this.todos;
    const inicio = (this.page - 1) * POR_PAGINA;
    this.users = filtrados.slice(inicio, inicio + POR_PAGINA);
    this.hayMas = filtrados.length > inicio + POR_PAGINA;
  }

  doSearch() {
    this.q = this.search.value?.trim() || '';
    this.page = 1;
    this.paginar();
  }

  nextPage() { if (this.hayMas) { this.page++; this.paginar(); } }
  prevPage() { if (this.page > 1) { this.page--; this.paginar(); } }

  cambiarRol(u: UsuarioVisible, rol: Rol) {
    // Pasar de super usuario (sin grupo) a otro rol exige un grupo: se usa el primero.
    const grupoId = rol === 'superusuario' ? null : (u.grupo_id ?? this.grupos[0]?.id ?? null);
    this.guardar(u, rol, grupoId);
  }

  cambiarGrupo(u: UsuarioVisible, grupoId: string) {
    this.guardar(u, u.rol, grupoId);
  }

  private guardar(u: UsuarioVisible, rol: Rol, grupoId: string | null) {
    const anterior = { rol: u.rol, grupo_id: u.grupo_id };
    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.setRol(u.id, rol, grupoId).subscribe({
      next: () => {
        u.rol = rol;
        u.grupo_id = grupoId;
        this.okMsg = `Usuario ${u.email} actualizado.`;
        this.loading = false;
      },
      error: (e) => {
        Object.assign(u, anterior);
        this.errorMsg = e?.message || 'No se pudo actualizar el usuario';
        this.loading = false;
      },
    });
  }

  crearGrupo() {
    const nombre = this.nuevoGrupo.value?.trim();
    if (!nombre || this.nuevoGrupo.invalid) { this.nuevoGrupo.markAsTouched(); return; }
    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.crearGrupo(nombre).subscribe({
      next: (g) => {
        this.grupos = [...this.grupos, g].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.nuevoGrupo.reset('');
        this.okMsg = `Grupo "${g.nombre}" creado.`;
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo crear el grupo';
        this.loading = false;
      },
    });
  }

  borrarGrupo(g: Grupo) {
    const ok = confirm(`¿Eliminar el grupo "${g.nombre}"? Solo se puede si no tiene participantes, asignaciones ni usuarios.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.borrarGrupo(g.id).subscribe({
      next: () => {
        this.grupos = this.grupos.filter((x) => x.id !== g.id);
        this.okMsg = `Grupo "${g.nombre}" eliminado.`;
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo eliminar el grupo';
        this.loading = false;
      },
    });
  }

  confirmAndDelete(u: UsuarioVisible) {
    const ok = confirm(`¿Eliminar al usuario ${u.email ?? u.id}? Esta acción no se puede deshacer.`);
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteUser(u.id).subscribe({
      next: () => {
        this.okMsg = 'Usuario eliminado.';
        this.load();
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo eliminar';
        this.loading = false;
      },
    });
  }

  logout(): void {
    this.svc.logout();
    this.router.navigate(['/login']);
  }
}
