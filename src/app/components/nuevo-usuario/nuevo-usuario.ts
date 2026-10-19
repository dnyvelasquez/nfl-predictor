import { Component, inject, OnInit } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, FormBuilder, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, ROLES_GRUPO, RolGrupo } from '../../services/auth/auth';
import { GruposService, GrupoDisponible, ModoGrupo } from '../../services/grupos';
import { IdiomaService } from '../../i18n/idioma';
import { TPipe } from '../../i18n/t.pipe';
import { registrarTextosAdmin } from '../../i18n/textos.admin';

registrarTextosAdmin();

@Component({
  selector: 'app-nuevo-usuario',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    FormsModule,
    ReactiveFormsModule,
    MatIconModule,
    MatMenuModule,
    MatButtonModule,
    RouterModule, TPipe
  ],
  templateUrl: './nuevo-usuario.html',
  styleUrls: ['./nuevo-usuario.css']
})
export class NuevoUsuario implements OnInit {
  private idioma = inject(IdiomaService);

  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private gruposService = inject(GruposService);
  private router = inject(Router);

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;

  // Solo los grupos donde el usuario en sesión puede agregar miembros. En los
  // que administra solo puede crear usuarios de solo lectura (RLS lo exige igual);
  // el super usuario elige el rol. Hacer super usuario a alguien se hace en "Usuarios".
  roles = ROLES_GRUPO;
  grupos: GrupoDisponible[] = [];
  etiquetaModo = (modo: ModoGrupo) => this.idioma.t(`modo.${modo}` as 'modo.equipos');
  etiquetaRol = (rol: RolGrupo) => this.idioma.t(`rol.${rol}` as 'rol.lectura');
  // En Modo Pronóstico cada usuario es un participante: se pide su nombre.
  esPronostico = false;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    grupoId: [null as string | null, Validators.required],
    rol: ['lectura' as RolGrupo, Validators.required],
    participante: [{ value: '', disabled: true }, [Validators.required, Validators.maxLength(40)]],
  });

  get f() { return this.form.controls; }

  ngOnInit(): void {
    this.gruposService.gruposDisponibles$().subscribe({
      next: ({ grupos, seleccionado }) => {
        this.grupos = grupos.filter((g) => g.rol === 'superusuario' || g.rol === 'administrador');
        const inicial = this.grupos.find((g) => g.id === seleccionado)?.id ?? this.grupos[0]?.id ?? null;
        this.form.patchValue({ grupoId: inicial });
        this.ajustarRol();
      },
      error: (e) => this.errorMsg = this.idioma.error(e, 'admin.errorGrupos'),
    });
  }

  ajustarRol() {
    const grupo = this.grupos.find((g) => g.id === this.form.getRawValue().grupoId);
    this.esPronostico = grupo?.modo === 'pronostico';
    if (this.esPronostico) this.f.participante.enable(); else this.f.participante.disable();
    if (grupo?.rol === 'superusuario') {
      this.f.rol.enable();
    } else {
      this.f.rol.setValue('lectura');
      this.f.rol.disable();
    }
  }

  submit() {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password, grupoId, rol, participante } = this.form.getRawValue();
    this.loading = true;
    this.errorMsg = this.okMsg = null;

    this.authService.crearUsuario(String(email), String(password), String(grupoId), rol as RolGrupo,
      this.esPronostico ? String(participante) : undefined)
      .subscribe({
        next: ({ yaExistia }) => {
          this.okMsg = yaExistia
            ? this.idioma.t('nu.yaExistia')
            : this.idioma.t('nu.creado');
          this.form.reset({ grupoId, rol: 'lectura', participante: '' });
          this.ajustarRol();
          this.loading = false;
        },
        error: (e) => {
          this.errorMsg = this.idioma.error(e, 'nu.errorCrear');
          this.loading = false;
        },
      });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}
