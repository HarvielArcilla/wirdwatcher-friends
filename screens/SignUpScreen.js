import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getAuth,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
} from "firebase/auth";
import { app } from '../firebase/firebase'; // Import Firebase configuration

const SignUpScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const navigate = useNavigate();

  const signUp = async () => {
    try {
      const auth = getAuth(app);
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      await sendEmailVerification(auth.currentUser).catch((err) =>
        console.log(err)
      );
      await updateProfile(auth.currentUser, { displayName: username }).catch(
        (err) => console.log(err)
      );
      
      navigate('/dashboard');
    } catch (error) {
      console.error(error.message);
      alert('Error signing up: ' + error.message);
    }
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Create an Account</h1>
      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        style={styles.input}
      />
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={styles.input}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={styles.input}
      />
      <button onClick={signUp} style={styles.button}>Sign Up</button>
      <p style={styles.text}>
        Already have an account?{' '}
        <span onClick={() => navigate('/')} style={styles.link}>
          Sign In
        </span>
      </p>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
    width: '100vw',
    backgroundColor: '#f4f4f4',
    fontFamily: 'Fredoka_Regular',
    padding: '20px',
    boxSizing: 'border-box',
  },
  title: {
    fontFamily: 'Fredoka_Bold',
    fontSize: '2rem',
    color: '#333',
    marginBottom: '20px',
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: '400px',
    padding: '12px',
    marginBottom: '15px',
    borderRadius: '5px',
    border: '1px solid #ccc',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  button: {
    width: '100%',
    maxWidth: '400px',
    padding: '12px',
    backgroundColor: '#4CAF50',
    border: 'none',
    borderRadius: '5px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  text: {
    marginTop: '20px',
    color: '#777',
    fontSize: '1rem',
    textAlign: 'center',
  },
  link: {
    color: '#4CAF50',
    cursor: 'pointer',
  },
};

export default SignUpScreen;