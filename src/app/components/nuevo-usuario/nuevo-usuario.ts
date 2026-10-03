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
import { GruposService, GrupoDisponible } from '../../services/grupos';

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
    RouterModule
  ],
  templateUrl: './nuevo-usuario.html',
  styleUrls: ['./nuevo-usuario.css']
})
export class NuevoUsuario implements OnInit {

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

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    grupoId: [null as string | null, Validators.required],
    rol: ['lectura' as RolGrupo, Validators.required],
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
      error: (e) => this.errorMsg = e?.message || 'No fue posible cargar los grupos',
    });
  }

  ajustarRol() {
    const grupo = this.grupos.find((g) => g.id === this.form.getRawValue().grupoId);
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
    const { email, password, grupoId, rol } = this.form.getRawValue();
    this.loading = true;
    this.errorMsg = this.okMsg = null;

    this.authService.crearUsuario(String(email), String(password), String(grupoId), rol as RolGrupo)
      .subscribe({
        next: ({ yaExistia }) => {
          this.okMsg = yaExistia
            ? 'El usuario ya existía: se agregó al grupo (su contraseña no cambió)'
            : 'Usuario creado correctamente';
          this.form.reset({ grupoId, rol: 'lectura' });
          this.ajustarRol();
          this.loading = false;
        },
        error: (e) => {
          this.errorMsg = e?.message || 'No fue posible crear el usuario';
          this.loading = false;
        },
      });
  }

  logout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

}
