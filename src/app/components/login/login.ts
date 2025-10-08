import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { Service } from '../../services/data';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { finalize } from 'rxjs/operators';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    ReactiveFormsModule
  ],
  templateUrl: './login.html',
  styleUrls: ['./login.css']
})
export class Login {
  form: FormGroup;
  errorMsg: string | null = null;
  loading = false;

  constructor(
    private fb: FormBuilder,
    private service: Service, 
    private router: Router,
    private route: ActivatedRoute,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

onSubmit(): void {
  if (this.form.invalid || this.loading) {
    this.form.markAllAsTouched();
    return;
  }
  this.loading = true;
  this.errorMsg = null;

  const { email, password } = this.form.value;

  this.service.login(email, password).pipe(finalize(() => this.loading = false))
    .subscribe({
      next: (res) => {
        const user = res?.data ?? res;
        if (!user) { this.errorMsg = 'Credenciales incorrectas'; return; }

        const redirect = this.route.snapshot.queryParamMap.get('redirect') || '/admin';
        this.router.navigateByUrl(redirect, { replaceUrl: true });
      },
      error: () => this.errorMsg = 'Correo o contraseña incorrectos'
    });
}



}
