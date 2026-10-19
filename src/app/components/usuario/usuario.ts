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
import { GruposService, Grupo, ModoGrupo, MODOS_GRUPO } from '../../services/grupos';
import { Router, RouterModule } from '@angular/router';
import { Observable, forkJoin } from 'rxjs';
import { IdiomaService } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { registrarTextosAdmin } from '../../i18n/textos.admin';

registrarTextosAdmin();

const POR_PAGINA = 20;

@Component({
  selector: 'app-usuario',
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
    RouterModule, TPipe
  ],
  templateUrl: './usuario.html',
  styleUrls: ['./usuario.css']
})
export class Usuario implements OnInit {
  private idioma = inject(IdiomaService);

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
  modos = MODOS_GRUPO;
  etiquetaModo = (modo: ModoGrupo) => this.idioma.t(`modo.${modo}` as 'modo.equipos');
  etiquetaRol = (rol: RolGrupo) => this.idioma.t(`rol.${rol}` as 'rol.lectura');
  grupos: Grupo[] = [];
  // El usuario en sesión no puede quitarse el super usuario ni borrarse (evita quedarse sin super usuario).
  miUserId: string | null = null;

  search = this.fb.control('');
  nuevoGrupo = this.fb.control('', [Validators.required, Validators.minLength(2)]);
  nuevaApuesta = this.fb.control<number | null>(null, [Validators.min(0)]);
  nuevoModo = this.fb.control<ModoGrupo | null>(null, [Validators.required]);


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
        this.errorMsg = this.idioma.error(e, 'us.errorCargar');
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
    this.ejecutar(this.svc.setSuperusuario(u.id, esSuper), this.idioma.t('us.actualizado', { email: u.email }), () => u.esSuperusuario = esSuper);
  }

  cambiarRolEnGrupo(u: UsuarioVisible, m: MembresiaVisible, rol: RolGrupo) {
    this.ejecutar(this.svc.setRolEnGrupo(u.id, m.grupo_id, rol), this.idioma.t('us.rolActualizado', { email: u.email, grupo: m.grupo }), () => m.rol = rol);
  }

  quitarDeGrupo(u: UsuarioVisible, m: MembresiaVisible) {
    const aviso = m.participante ? this.idioma.t('us.avisoParticipante', { p: m.participante }) : '';
    if (!confirm(this.idioma.t('us.confirmSacar', { email: u.email, grupo: m.grupo, aviso }))) return;
    this.ejecutar(this.svc.quitarDeGrupo(u.id, m.grupo_id), this.idioma.t('us.salio', { email: u.email, grupo: m.grupo }),
      () => u.membresias = u.membresias.filter((x) => x.grupo_id !== m.grupo_id));
  }

  agregarAGrupo(u: UsuarioVisible, g: Grupo) {
    // En Modo Pronóstico el usuario entra como participante: hace falta su nombre.
    let participante: string | null = null;
    if (g.modo === 'pronostico') {
      participante = prompt(this.idioma.t('us.promptParticipante', { email: u.email, grupo: g.nombre }))?.trim() || null;
      if (!participante) return;
    }
    this.ejecutar(this.svc.agregarMiembro(u.email, g.id, 'lectura', participante ?? undefined),
      this.idioma.t('us.agregado', { email: u.email, grupo: g.nombre, extra: participante ? this.idioma.t('us.agregadoExtra', { p: participante }) : '' }),
      () => u.membresias = [...u.membresias, { grupo_id: g.id, grupo: g.nombre, rol: 'lectura' as RolGrupo, participante }]
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
        this.errorMsg = this.idioma.error(e, 'us.errorActualizar');
        this.loading = false;
      },
    });
  }

  crearGrupo() {
    const nombre = this.nuevoGrupo.value?.trim();
    const modo = this.nuevoModo.value;
    if (!nombre || this.nuevoGrupo.invalid || !modo) {
      this.nuevoGrupo.markAsTouched();
      this.nuevoModo.markAsTouched();
      return;
    }
    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.crearGrupo(nombre, modo, this.leerApuesta(this.nuevaApuesta.value)).subscribe({
      next: (g) => {
        this.grupos = [...this.grupos, g].sort((a, b) => a.nombre.localeCompare(b.nombre));
        this.nuevoGrupo.reset('');
        this.nuevaApuesta.reset(null);
        this.nuevoModo.reset(null);
        this.okMsg = this.idioma.t('us.grupoCreado', { grupo: g.nombre, modo: this.etiquetaModo(g.modo) });
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = this.idioma.error(e, 'us.errorCrearGrupo');
        this.loading = false;
      },
    });
  }

  cambiarApuesta(g: Grupo, valor: string) {
    const apuesta = this.leerApuesta(valor);
    if (apuesta === g.apuesta) return;
    if (apuesta !== null && apuesta < 0) { this.errorMsg = this.idioma.t('us.apuestaNegativa'); return; }

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.actualizarApuesta(g.id, apuesta).subscribe({
      next: () => {
        g.apuesta = apuesta;
        this.okMsg = this.idioma.t('us.apuestaActualizada', { grupo: g.nombre });
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = this.idioma.error(e, 'us.errorApuesta');
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
    const ok = confirm(this.idioma.t('us.confirmBorrarGrupo', { grupo: g.nombre }));
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.gruposService.borrarGrupo(g.id).subscribe({
      next: () => {
        this.grupos = this.grupos.filter((x) => x.id !== g.id);
        this.okMsg = this.idioma.t('us.grupoEliminado', { grupo: g.nombre });
        this.loading = false;
      },
      error: (e) => {
        this.errorMsg = this.idioma.error(e, 'us.errorBorrarGrupo');
        this.loading = false;
      },
    });
  }

  confirmAndDelete(u: UsuarioVisible) {
    const ok = confirm(this.idioma.t('us.confirmEliminarUsuario', { usuario: u.email ?? u.id }));
    if (!ok) return;

    this.loading = true; this.errorMsg = this.okMsg = null;
    this.svc.deleteUser(u.id).subscribe({
      next: () => {
        this.okMsg = this.idioma.t('us.usuarioEliminado');
        this.load();
      },
      error: (e) => {
        this.errorMsg = this.idioma.error(e, 'admin.errorEliminar');
        this.loading = false;
      },
    });
  }

  logout(): void {
    this.svc.logout();
    this.router.navigate(['/login']);
  }
}
