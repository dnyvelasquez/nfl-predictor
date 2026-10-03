import { Component, inject, OnInit } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { AuthService, ROLES_GRUPO, RolGrupo, UsuarioVisible, MembresiaVisible } from '../../services/auth/auth';
import { GruposService, Grupo } from '../../services/grupos';
import { Router, RouterModule } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';

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
    MatCheckboxModule,
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

  roles = ROLES_GRUPO;
  grupos: Grupo[] = [];
  // El usuario en sesión no puede quitarse el super usuario ni borrarse (evita quedarse sin super usuario).
  miUserId: string | null = null;

  search = this.fb.control('');
  nuevoGrupo = this.fb.control('', [Validators.required, Validators.minLength(2)]);
  nuevaApuesta = this.fb.control<number | null>(null, [Validators.min(0)]);


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

  gruposSinMembresia(u: UsuarioVisible): Grupo[] {
    return this.grupos.filter((g) => !u.membresias.some((m) => m.grupo_id === g.id));
  }

  cambiarSuperusuario(u: UsuarioVisible, esSuper: boolean) {
    this.ejecutar(this.svc.setSuperusuario(u.id, esSuper), `Usuario ${u.email} actualizado.`, () => u.esSuperusuario = esSuper);
  }

  cambiarRolEnGrupo(u: UsuarioVisible, m: MembresiaVisible, rol: RolGrupo) {
    this.ejecutar(this.svc.setRolEnGrupo(u.id, m.grupo_id, rol), `Rol de ${u.email} en "${m.grupo}" actualizado.`, () => m.rol = rol);
  }

  quitarDeGrupo(u: UsuarioVisible, m: MembresiaVisible) {
    if (!confirm(`¿Sacar a ${u.email} del grupo "${m.grupo}"?`)) return;
    this.ejecutar(this.svc.quitarDeGrupo(u.id, m.grupo_id), `${u.email} salió de "${m.grupo}".`,
      () => u.membresias = u.membresias.filter((x) => x.grupo_id !== m.grupo_id));
  }

  agregarAGrupo(u: UsuarioVisible, g: Grupo) {
    this.ejecutar(this.svc.agregarMiembro(u.email, g.id, 'lectura'), `${u.email} agregado a "${g.nombre}" como solo lectura.`,
      () => u.membresias = [...u.membresias, { grupo_id: g.id, grupo: g.nombre, rol: 'lectura' as RolGrupo }]
        .sort((a, b) => a.grupo.localeCompare(b.grupo)));
  }

  // Ejecuta un cambio y, si sale bien, lo refleja en la fila sin recargar toda la lista.
  private ejecutar(op: Observable<unknown>, ok: string, aplicar: () => void) {
    this.loading = true; this.errorMsg = this.okMsg = null;
    op.subscribe({
      next: () => {
        aplicar();
        this.okMsg = ok;
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo actualizar el usuario';
        this.loading = false;
      },
    });
  }

  crearGrupo() {
    const nombre = this.nuevoGrupo.value?.trim();
    if (!nombre || this.nuevoGrupo.invalid) { this.nuevoGrupo.markAsTouched(); return; }
    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.crearGrupo(nombre, this.leerApuesta(this.nuevaApuesta.value)).subscribe({
      next: (g) => {
        this.grupos = [...this.grupos, g].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.nuevoGrupo.reset('');
        this.nuevaApuesta.reset(null);
        this.okMsg = `Grupo "${g.nombre}" creado.`;
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo crear el grupo';
        this.loading = false;
      },
    });
  }

  cambiarApuesta(g: Grupo, valor: string) {
    const apuesta = this.leerApuesta(valor);
    if (apuesta === g.apuesta) return;
    if (apuesta !== null && apuesta < 0) { this.errorMsg = 'La apuesta no puede ser negativa'; return; }

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.actualizarApuesta(g.id, apuesta).subscribe({
      next: () => {
        g.apuesta = apuesta;
        this.okMsg = `Apuesta de "${g.nombre}" actualizada.`;
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = e?.message || 'No se pudo actualizar la apuesta';
        this.loading = false;
      },
    });
  }

  private leerApuesta(valor: string | number | null): number | null {
    if (valor === null || valor === '') return null;
    const n = Math.round(Number(valor));
    return Number.isFinite(n) ? n : null;
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
