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
import { forkJoin } from 'rxjs';
import { AuthService, ROLES, Rol } from '../../services/auth/auth';
import { GruposService, Grupo } from '../../services/grupos';

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

  // El super usuario elige rol y grupo; el administrador solo crea usuarios de
  // solo lectura en su propio grupo (RLS lo exige igual).
  esSuperusuario = false;
  roles = ROLES;
  grupos: Grupo[] = [];

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rol: ['lectura' as Rol, Validators.required],
    grupoId: [null as string | null],
  });

  get f() { return this.form.controls; }

  ngOnInit(): void {
    forkJoin({
      rol: this.authService.getRol$(),
      disponibles: this.gruposService.gruposDisponibles$(),
    }).subscribe({
      next: ({ rol, disponibles }) => {
        this.esSuperusuario = rol === 'superusuario';
        this.grupos = disponibles.grupos;
        this.form.patchValue({ grupoId: disponibles.seleccionado });
        if (!this.esSuperusuario) {
          this.f.rol.disable();
          this.f.grupoId.disable();
        }
      },
      error: (e) => this.errorMsg = e?.message || 'No fue posible cargar los grupos',
    });
  }

  necesitaGrupo(): boolean {
    return this.form.getRawValue().rol !== 'superusuario';
  }

  submit() {
    const { email, password, rol, grupoId } = this.form.getRawValue();
    if (this.form.invalid || this.loading || (this.necesitaGrupo() && !grupoId)) {
      this.form.markAllAsTouched();
      if (this.necesitaGrupo() && !grupoId) this.errorMsg = 'Selecciona un grupo';
      return;
    }
    this.loading = true;
    this.errorMsg = this.okMsg = null;

    this.authService.crearUsuario(String(email), String(password), rol as Rol, grupoId)
      .subscribe({
        next: () => {
          this.okMsg = 'Usuario creado correctamente';
          this.form.reset({ rol: 'lectura', grupoId });
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
