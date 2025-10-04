import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Service } from '../../services/data';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { FormsModule, FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';

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

  constructor(
    private fb: FormBuilder,
    private service: Service, 
    private router: Router,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  onSubmit(): void {

    if (this.form.invalid) {
      return;
    }

    const { email, password } = this.form.value;

    this.service.login(email, password).subscribe({
      next: (user) => {
        if (user) {          
          this.router.navigate(['/admin']);
        } else {
          this.errorMsg = 'Credenciales incorrectas';
        }
      },
      error: (err) => {
        console.error(err);
        this.errorMsg = 'Ocurrió un error al iniciar sesión';
      }
    });
  }
}
