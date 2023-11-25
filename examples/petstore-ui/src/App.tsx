/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';

import './App.css';

import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';

interface Error {
  name: string;
}

function isError(err: unknown): err is Error {
  return (err as Error)?.name !== undefined;
}

function App() {
  const [message, setMessage] = useState('none');

  function handleClick(_e: unknown) {
    setMessage('loading...');
    const getMessage = async () => {
      try {
        console.log('trying...');
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 1000);

        const resp = await fetch(`${window.location.origin}/api/message`, {
          method: 'GET',
          signal: controller.signal,
        });
        clearTimeout(id);

        if (resp.status === 503) {
          setMessage('throttled');
        } else if (resp.status === 200) {
          setMessage(await resp.text());
        } else {
          setMessage('error');
        }
      } catch (err: unknown) {
        if (isError(err)) {
          setMessage(err.name);
        }
      }
    };

    void getMessage();
  }

  return (
    <Container fluid>
      <Row className="justify-content-md-center">
        <Col md="auto">
          <Button name="testClick" onClick={handleClick}>
            Get Response
          </Button>
        </Col>
      </Row>

      <Row className="justify-content-md-center">
        <Col md="auto">{message}</Col>
      </Row>
    </Container>
  );
}

export default App;
