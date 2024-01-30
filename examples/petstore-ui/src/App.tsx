/* eslint-disable react/react-in-jsx-scope */
import { useState } from 'react';

import './App.css';

import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Container from 'react-bootstrap/Container';
import Form from 'react-bootstrap/Form';
import Row from 'react-bootstrap/Row';

interface Error {
  name: string;
}

function isError(err: unknown): err is Error {
  return (err as Error)?.name !== undefined;
}

function App() {
  const [message, setMessage] = useState('none');
  const [orderId, setOrderId] = useState('1');

  function handleClick(_e: unknown) {
    setMessage('loading...');
    const getMessage = async () => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 150);

        const req = new Request(`${window.location.origin}/store/order/${orderId}`, {
          method: 'GET',
          signal: controller.signal,
        });

        // Check for aborts...
        req.signal.onabort = () => console.log('request aborted');

        const resp = await fetch(req);
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
          console.log(`Error: ${err.name}`);
          setMessage(err.name);
        }
      }
    };

    void getMessage();
  }

  function handleCreate(_e: unknown) {
    setMessage('loading...');
    const getMessage = async () => {
      try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 150);

        const req = new Request(`${window.location.origin}/store/order`, {
          method: 'POST',
          body: JSON.stringify({
            pet_id: 1,
            quantity: 1,
            status: 'placed',
            complete: false,
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          signal: controller.signal,
        });

        // Check for aborts...
        req.signal.onabort = () => console.log('request aborted');

        const resp = await fetch(req);
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
          console.log(`Error: ${err.name}`);
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
          <Form.Control placeholder="OrderId" onChange={(e) => setOrderId(e.target.value)} />
        </Col>
      </Row>

      <Row className="justify-content-md-center">
        <Col md="auto">
          <Button name="testClick" onClick={handleClick}>
            Get Response
          </Button>
          <Button name="testCreate" onClick={handleCreate}>
            Create
          </Button>
        </Col>
      </Row>

      <Row className="justify-content-md-center">
        <Col md="auto" name="testMessage">
          {message}
        </Col>
      </Row>
    </Container>
  );
}

export default App;
