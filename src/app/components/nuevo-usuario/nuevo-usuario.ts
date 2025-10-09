import { Component, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors  } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Service } from '../../services/data';

function samePass(ctrl: AbstractControl): ValidationErrors | null {
  const p1 = ctrl.get('password')?.value;
  const p2 = ctrl.get('confirm')?.value;
  if (!p1 || !p2) return null;
  return p1 === p2 ? null : { mismatch: true };
}

@Component({
  selector: 'app-nuevo-usuario',
  standalone: true,
  imports: [
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
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
export class NuevoUsuario {

  private fb = inject(FormBuilder);
  private service = inject(Service); 
  private router = inject(Router);

  loading = false;
  errorMsg: string | null = null;
  okMsg: string | null = null;

  form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  get f() { return this.form.controls; }

  submit() {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.errorMsg = this.okMsg = null;

    const { email, password } = this.form.value;

    this.service.createUserAsAdmin(String(email), String(password))
      .subscribe({
        next: (res: any) => {
          if (res?.error) { 
            this.errorMsg = res.error; return; 
          }
          this.okMsg = 'Usuario creado correctamente';
          this.form.reset();
        },
        error: (e) => this.errorMsg = e?.message || 'No fue posible crear el usuario',
        complete: () => this.loading = false,
      });
  }


  logout(): void {
    this.service.logout();
    this.router.navigate(['/login']);
  }  

}